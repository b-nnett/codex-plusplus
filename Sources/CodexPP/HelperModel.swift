import AppKit
import Combine
import ServiceManagement
import CodexPPCore

private struct RuntimeDiagnostic: Decodable {
    let schema: Int
    let pid: Int32
    let time: String
    let windows: Int
    let activeExtensions: [String]
    let runtimeErrors: [String: String]
}

@MainActor
final class HelperModel: ObservableObject {
    @Published private(set) var settings = HelperSettings()
    @Published private(set) var extensions: [InstalledExtension] = []
    @Published private(set) var problems: [String] = []
    @Published private(set) var runtimeErrors: [String: String] = [:]
    @Published private(set) var connected = false
    @Published private(set) var running = false
    @Published private(set) var updateProgress: String?
    @Published private(set) var busy = false
    @Published private(set) var activeCount = 0
    @Published var message: String?
    @Published private(set) var loginEnabled = SMAppService.mainApp.status == .enabled
    let store: ExtensionStore
    private var monitor: Task<Void, Never>?
    private var configurationReadable = true
    private var polling = false
    private var validatedPatchStamp: String?
    private var connectionError: String?
    private var failedUpdateTicket: Data?
    private static func runtimeDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
    var hasPatchedApp: Bool { FileManager.default.fileExists(atPath: URL(fileURLWithPath: settings.appPath).appendingPathComponent("Contents/Resources/codexpp-patch.json").path) }
    var statusChanged: (() -> Void)?
    var github: URL { ExtensionManifest.repositoryURL(settings.githubRepo ?? "b-nnett/codex-plusplus")! }
    let isPreview = Bundle.main.object(forInfoDictionaryKey: "CodexPPPreview") as? Bool == true

    init(root: URL? = nil) {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let preview = Bundle.main.object(forInfoDictionaryKey: "CodexPPPreview") as? Bool == true
        store = ExtensionStore(root: root ?? (preview ? FileManager.default.temporaryDirectory.appendingPathComponent("CodexPP-Preview") : support.appendingPathComponent("CodexPP")))
        do {
            settings = try store.readSettings()
            let candidates = [
                URL(fileURLWithPath: "/Applications/ChatGPT.app"),
                FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications/ChatGPT.app"),
                URL(fileURLWithPath: "/Applications/Codex.app"),
                NSWorkspace.shared.urlForApplication(withBundleIdentifier: DesktopAppLocator.bundleIdentifier)
            ].compactMap { $0 }
            if let path = DesktopAppLocator.resolve(configuredPath: settings.appPath, candidates: candidates), path != settings.appPath {
                settings.appPath = path
                try store.writeSettings(settings)
            }
            try reloadExtensions()
        } catch {
            configurationReadable = false
            message = "Could not read the helper settings. They have been left untouched. \(error.localizedDescription)"
        }
    }
    /// Startup speed-ups that matched the patched build, from its discovery report.
    var startupStatus: StartupStatus? { hasPatchedApp ? StartupStatus.read(app: URL(fileURLWithPath: settings.appPath).resolvingSymlinksInPath()) : nil }
    var appName: String { URL(fileURLWithPath: settings.appPath).deletingPathExtension().lastPathComponent }
    var extensionErrorStatus: String? {
        guard !runtimeErrors.isEmpty else { return nil }
        return runtimeErrors.count == 1 ? "1 extension error" : "\(runtimeErrors.count) extension errors"
    }
    var statusError: String? { connectionError ?? extensionErrorStatus }
    var repairActionTitle: String? {
        guard configurationReadable else { return nil }
        if !hasPatchedApp { return "Install Extensions Support and Restart" }
        if statusError != nil || (running && !connected && !settings.extensionsPaused) {
            return "Repair and Restart \(appName)"
        }
        return nil
    }
    var status: String {
        if let updateProgress { return updateProgress }
        if busy { return "Working…" }
        if let connectionError { return connectionError }
        if settings.extensionsPaused { return running ? "Running without extensions" : "Extensions paused" }
        if connected { return extensionErrorStatus ?? "Connected to \(appName)" }
        return running ? "Restart to connect extensions" : "\(appName) is closed"
    }
    var codexApp: NSRunningApplication? {
        guard !isPreview else { return nil }
        let selected = URL(fileURLWithPath: settings.appPath).resolvingSymlinksInPath()
        return NSWorkspace.shared.runningApplications.first { $0.bundleURL?.resolvingSymlinksInPath() == selected && ProcessLiveness.isAlive($0.processIdentifier) }
    }
    func startMonitoring() {
        guard monitor == nil, !isPreview else { return }
        monitor = Task { [weak self] in
            while !Task.isCancelled {
                await self?.resumeUpdateIfNeeded()
                await self?.poll()
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }
    private func resumeUpdateIfNeeded() async {
        guard !busy, !polling, configurationReadable else { return }
        let file = UpdateHandoff.file(in: store.root)
        guard let bytes = try? Data(contentsOf: file), bytes != failedUpdateTicket else { return }
        do {
            let ticket = try JSONDecoder().decode(UpdateHandoff.self, from: bytes)
            let app = URL(fileURLWithPath: settings.appPath).resolvingSymlinksInPath()
            let helper = Bundle.main.bundleURL.resolvingSymlinksInPath()
            try ticket.validate(app: app, helper: helper)
            guard !ProcessLiveness.isAlive(ticket.oldPID),
                  codexApp == nil else { return }
            // Sparkle may use a non-atomic vendor-to-local replacement. Wait
            // for its installer to exit before reading or changing the bundle.
            let processes = try await runCommand("/bin/ps", ["-axo", "command="])
            guard processes.status == 0,
                  !processes.output.split(separator: "\n").contains(where: {
                      $0.contains("/Autoupdate \(DesktopAppLocator.bundleIdentifier) ")
                  }), let adapter = try ticket.replacementAdapter(at: app) else { return }
            try await operate {
                self.connectionError = nil
                self.updateProgress = "Preparing update…"
                defer { self.updateProgress = nil; self.statusChanged?() }
                let patcher = AppPatcher(support: self.store.root, helper: helper, port: self.settings.port, adapter: adapter, onProgress: { [weak self] phase in
                    Task { @MainActor in
                        self?.updateProgress = phase
                        self?.statusChanged?()
                    }
                })
                _ = try await Task.detached { try patcher.install(app) }.value
                // A durable success record precedes deleting the pending ticket.
                let evidence: [String: Any] = ["schema":1,"state":"patched","fromPID":ticket.oldPID,
                    "targetBuild":adapter.build,"adapter":adapter.id,"time":ISO8601DateFormatter().string(from: Date())]
                try JSONSerialization.data(withJSONObject: evidence, options: [.sortedKeys]).write(to: self.store.root.appendingPathComponent("Diagnostics/update.json"), options: .atomic)
                try FileManager.default.removeItem(at: file)
                self.updateProgress = "Restarting ChatGPT…"; self.statusChanged?()
                let config = NSWorkspace.OpenConfiguration()
                config.createsNewApplicationInstance = true
                _ = try await NSWorkspace.shared.openApplication(at: app, configuration: config)
                self.validatedPatchStamp = nil
                self.failedUpdateTicket = nil
            }
        } catch {
            failedUpdateTicket = bytes
            connectionError = "Automatic repatch failed: \(error.localizedDescription)"
            message = connectionError
            writeDiagnostics(); statusChanged?()
        }
    }
    func reloadExtensions() throws {
        let loaded = try store.list()
        extensions = loaded.extensions; problems = loaded.problems
    }
    func refresh() { perform { try self.reloadExtensions(); await self.poll(force: true) } }
    func isEnabled(_ item: InstalledExtension) -> Bool { settings.enabled[item.id] == true }
    func setEnabled(_ item: InstalledExtension, _ enabled: Bool) {
        perform {
            var next = self.settings; next.enabled[item.id] = enabled
            try self.save(next)
            await self.poll(force: true)
        }
    }
    private func save(_ value: HelperSettings) throws {
        guard configurationReadable else { throw HelperError.message("Repair settings.json before making changes; the original file has been preserved.") }
        try store.writeSettings(value)
        settings = value
        statusChanged?()
    }
    func perform(_ operation: @escaping @MainActor () async throws -> Void) {
        guard !busy else { return }
        Task {
            do { try await self.operate(operation) } catch { message = error.localizedDescription }
        }
    }
    private func operate(_ operation: @MainActor () async throws -> Void) async throws {
        guard !busy else { throw HelperError.message("Wait for the current operation to finish.") }
        busy = true; statusChanged?()
        defer { busy = false; statusChanged?() }
        while polling { try await Task.sleep(for: .milliseconds(50)) }
        try await operation()
    }
    private func validatedApp() throws -> Bundle {
        guard let bundle = Bundle(path: settings.appPath), bundle.bundleIdentifier == DesktopAppLocator.bundleIdentifier else {
            throw HelperError.message("Choose ChatGPT.app in Settings. Older desktop releases may be named Codex.app.")
        }
        return bundle
    }
    func poll(force: Bool = false) async {
        guard !isPreview, (!busy || force), configurationReadable, !polling else { return }
        polling = true
        defer { polling = false; writeDiagnostics() }
        running = codexApp != nil
        guard running else {
            connected = false; activeCount = 0; statusChanged?(); return
        }
        do {
            settings = try store.readSettings()
            try reloadExtensions()
            guard hasPatchedApp else { throw HelperError.message("Restart ChatGPT from the helper to install Extensions support.") }
            let appURL = URL(fileURLWithPath: settings.appPath).resolvingSymlinksInPath()
            let framework = appURL.appendingPathComponent("Contents/Frameworks/Codex Framework.framework/Versions/Current/Codex Framework").resolvingSymlinksInPath()
            guard framework.path.hasPrefix(appURL.path + "/") else { throw HelperError.message("The browser framework is outside the selected app.") }
            let frameworkPath = String(framework.path.dropFirst(appURL.path.count + 1))
            let paths = ["Contents/Resources/app.asar", "Contents/Info.plist", "Contents/Resources/codexpp-patch.json", frameworkPath]
            let stamp = try paths.map { path in
                let attributes = try appURL.appendingPathComponent(path).resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
                return "\(appURL.path)/\(path):\(attributes.contentModificationDate?.timeIntervalSince1970 ?? 0):\(attributes.fileSize ?? 0)"
            }.joined(separator: "|")
            if validatedPatchStamp != stamp {
                let patcher = AppPatcher(support: store.root, helper: Bundle.main.bundleURL, port: settings.port, adapter: try PatchAdapter.forBundle(appURL))
                let report = try await Task.detached { try patcher.status(appURL) }.value
                guard report.state == "patched" else { throw HelperError.message("ChatGPT's Extensions support needs to be installed again.") }
                validatedPatchStamp = stamp
            }
            let diagnosticURL = store.root.appendingPathComponent("Diagnostics/runtime.json")
            let diagnostic = try JSONDecoder().decode(RuntimeDiagnostic.self, from: Data(contentsOf: diagnosticURL))
            let age = Self.runtimeDate(diagnostic.time).map { Date().timeIntervalSince($0) }
            guard diagnostic.schema == 1, diagnostic.pid == codexApp?.processIdentifier,
                  let age, age >= -2, age < 10 else {
                connected = false; activeCount = 0; statusChanged?(); return
            }
            connected = diagnostic.windows > 0
            runtimeErrors = diagnostic.runtimeErrors
            activeCount = diagnostic.activeExtensions.filter { runtimeErrors[$0] == nil }.count
            connectionError = nil
        } catch {
            connected = false; activeCount = 0
            connectionError = error.localizedDescription
            if force { message = "Could not connect extensions: \(error.localizedDescription)" }
        }
        statusChanged?()
    }
    private func writeDiagnostics() {
        let directory = store.root.appendingPathComponent("Diagnostics")
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            var snapshot: [String: Any] = ["schema": 1, "pid": ProcessInfo.processInfo.processIdentifier, "running": running, "connected": connected, "installedExtensions": extensions.count, "activeExtensions": activeCount, "extensionsPaused": settings.extensionsPaused, "time": ISO8601DateFormatter().string(from: Date())]
            snapshot["runtimeErrors"] = runtimeErrors
            if let connectionError { snapshot["error"] = connectionError }
            let file = directory.appendingPathComponent("helper.json")
            try JSONSerialization.data(withJSONObject: snapshot, options: [.sortedKeys]).write(to: file, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        } catch { /* Diagnostics must never prevent extensions from running. */ }
    }
    private func unload() async throws {
        activeCount = 0; connected = false
    }
    func restart(extensionsPaused: Bool) {
        perform { try await self.restartNow(extensionsPaused: extensionsPaused) }
    }
    func repair() {
        // Repair support and reconnect without toggling the user's pause setting
        // or changing which extensions are enabled.
        restart(extensionsPaused: settings.extensionsPaused)
    }
    func restoreOriginal() {
        perform {
            guard !self.isPreview else { throw HelperError.message("Restoration is disabled in the preview.") }
            let url = URL(fileURLWithPath: self.settings.appPath).resolvingSymlinksInPath()
            let patcher = AppPatcher(support: self.store.root, helper: Bundle.main.bundleURL, port: self.settings.port, adapter: try PatchAdapter.forBundle(URL(fileURLWithPath: self.settings.appPath)))
            _ = try await Task.detached { try patcher.status(url) }.value
            if let app = self.codexApp {
                guard app.terminate() else { throw HelperError.message("ChatGPT could not quit.") }
                for _ in 0..<40 { if app.isTerminated { break }; try await Task.sleep(for: .milliseconds(250)) }
                guard app.isTerminated else { throw HelperError.message("ChatGPT is still open. Finish any quit dialog and try again.") }
            }
            do { _ = try await Task.detached { try patcher.restore(url) }.value }
            catch { _ = try? await NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration()); throw error }
            self.validatedPatchStamp = nil
            _ = try await NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
        }
    }
    private func restartNow(extensionsPaused: Bool) async throws {
        guard !isPreview else { throw HelperError.message("Desktop app actions are disabled in this preview. Open Codex++.app to connect to ChatGPT.") }
        _ = try validatedApp()
        let appURL = URL(fileURLWithPath: settings.appPath).resolvingSymlinksInPath()
        let patcher = AppPatcher(support: store.root, helper: Bundle.main.bundleURL, port: settings.port, adapter: try PatchAdapter.forBundle(appURL))
        // Stage and probe before asking the running desktop app to quit.
        _ = try await Task.detached { try patcher.prepare(appURL) }.value
        var next = settings; next.extensionsPaused = extensionsPaused
        try save(next)
        // Terminating the renderer also clears extensions with incomplete cleanup.
        if let app = codexApp {
            guard app.terminate() else { throw HelperError.message("\(appName) could not quit. Close it manually and try again.") }
            for _ in 0..<40 {
                if !ProcessLiveness.isAlive(app.processIdentifier) { break }
                try await Task.sleep(for: .milliseconds(250))
            }
            guard !ProcessLiveness.isAlive(app.processIdentifier) else { throw HelperError.message("\(appName) is still open. Finish any quit dialog, then try again.") }
        }
        do { _ = try await Task.detached { try patcher.install(appURL) }.value }
        catch {
            // Commit rolls back automatically. Reopen the original on failure.
            _ = try? await NSWorkspace.shared.openApplication(at: appURL, configuration: NSWorkspace.OpenConfiguration())
            throw error
        }
        let config = NSWorkspace.OpenConfiguration()
        config.activates = true
        config.createsNewApplicationInstance = true
        _ = try await NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: settings.appPath), configuration: config)
        running = true; connected = false; activeCount = 0
        do {
            for _ in 0..<12 {
                await poll(force: true)
                if connected { break }
                try await Task.sleep(for: .milliseconds(500))
            }
        }
    }
    func openCodex() {
        guard !isPreview else { message = "Desktop app actions are disabled in this preview."; return }
        if let app = codexApp { app.activate(options: [.activateAllWindows]); return }
        restart(extensionsPaused: settings.extensionsPaused)
    }
    func installExtension() { perform { try await self.importExtension() } }
    private func importExtension() async throws {
        NSApp.activate(ignoringOtherApps: true)
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true; panel.canChooseFiles = false
        panel.prompt = "Choose extension"; panel.message = "Choose a folder containing manifest.json and its JavaScript entry."
        guard panel.runModal() == .OK, let folder = panel.url else { return }
        let candidate = try store.load(folder)
        let alert = NSAlert()
        alert.messageText = "Install \(candidate.manifest.name)?"
        alert.informativeText = "Version \(candidate.manifest.version). Extensions execute JavaScript inside \(appName) and can read or change its interface. Install code you trust. New extensions start disabled. An existing extension's enabled setting is preserved."
        alert.addButton(withTitle: "Install"); alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let store = self.store
        _ = try await Task.detached { try store.install(from: folder) }.value
        try reloadExtensions()
        await poll(force: true)
    }
    func remove(_ item: InstalledExtension) {
        perform {
            var next = self.settings; next.enabled[item.id] = false
            try self.save(next)
            await self.poll(force: true)
            try FileManager.default.trashItem(at: item.directory, resultingItemURL: nil)
            try self.reloadExtensions()
        }
    }
    func chooseApp() {
        let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.canChooseFiles = true
        panel.allowedContentTypes = [.applicationBundle]; panel.prompt = "Use this app"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        guard DesktopAppLocator.isSupported(url) else { message = "Choose the ChatGPT desktop application."; return }
        perform {
            try await self.unload()
            var next = self.settings; next.appPath = url.path
            try self.save(next)
            await self.poll(force: true)
        }
    }
    func changePort(_ port: Int) {
        perform {
            var next = self.settings; next.port = port
            try next.validate()
            try await self.unload()
            try self.save(next)
            self.connected = false
        }
    }
    func changeRepository(_ repository: String) {
        perform {
            var next = self.settings; next.githubRepo = repository
            try self.save(next)
        }
    }
    func setLogin(_ enabled: Bool) {
        guard !isPreview else { message = "Login changes are disabled in the UI preview."; return }
        do {
            if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            loginEnabled = SMAppService.mainApp.status == .enabled
            if SMAppService.mainApp.status == .requiresApproval { SMAppService.openSystemSettingsLoginItems() }
        } catch { message = error.localizedDescription }
    }
    func openSettings(manageExtensions: Bool = false, extensionID: String? = nil) {
        perform {
            guard !self.isPreview else { throw HelperError.message("Settings links are disabled in this preview. Open Codex++.app to use the desktop app’s settings.") }
            _ = try self.validatedApp()
            let configuration = NSWorkspace.OpenConfiguration()
            configuration.activates = true
            if manageExtensions {
                var next = self.settings
                next.settingsIntent += 1
                next.selectedExtensionId = extensionID
                try self.save(next)
            }
            // ChatGPT.app retains the codex scheme. Target the selected bundle,
            // rather than relying on whichever app is the default URL handler.
            _ = try await NSWorkspace.shared.open(
                [URL(string: "codex://settings")!],
                withApplicationAt: URL(fileURLWithPath: self.settings.appPath),
                configuration: configuration
            )
            if manageExtensions {
                for _ in 0..<12 {
                    await self.poll(force: true)
                    if self.connected { break }
                    try await Task.sleep(for: .milliseconds(500))
                }
                if !self.connected { throw HelperError.message("Settings is open. Choose Restart once to connect the helper, then select the extension again.") }
            }
        }
    }
    func openURL(_ url: URL) { NSWorkspace.shared.open(url) }
    func showFiles() { try? store.prepare(); NSWorkspace.shared.open(store.directory) }
    func prepareToQuit(_ completion: @escaping @MainActor (Bool) -> Void) {
        perform {
            do {
                try await self.unload()
                self.monitor?.cancel()
                completion(true)
            } catch {
                completion(false)
                throw error
            }
        }
    }
    func quit() { NSApp.terminate(nil) }
}
