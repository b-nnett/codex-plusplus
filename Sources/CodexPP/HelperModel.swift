import AppKit
import Combine
import ServiceManagement
import CodexPPCore

@MainActor
final class HelperModel: ObservableObject {
    @Published private(set) var settings = HelperSettings()
    @Published private(set) var extensions: [InstalledExtension] = []
    @Published private(set) var problems: [String] = []
    @Published private(set) var runtimeErrors: [String: String] = [:]
    @Published private(set) var connected = false
    @Published private(set) var running = false
    @Published private(set) var busy = false
    @Published private(set) var activeCount = 0
    @Published var message: String?
    @Published private(set) var loginEnabled = SMAppService.mainApp.status == .enabled
    let store: ExtensionStore
    private let bootstrap: String
    private let bridgeSource: String
    private let settingsSource: String
    private var settingsSessions: [String: SettingsSession] = [:]
    private var settingsIntent = 0
    private var selectedExtensionID: String?
    private var monitor: Task<Void, Never>?
    private var configurationReadable = true
    private var polling = false
    private var validatedPatchStamp: String?
    private var connectionError: String?
    var hasPatchedApp: Bool { FileManager.default.fileExists(atPath: URL(fileURLWithPath: settings.appPath).appendingPathComponent("Contents/Resources/codexpp-patch.json").path) }
    var statusChanged: (() -> Void)?
    var github: URL { ExtensionManifest.repositoryURL(settings.githubRepo ?? "b-nnett/codex-plusplus")! }
    let isPreview = Bundle.main.object(forInfoDictionaryKey: "CodexPPPreview") as? Bool == true

    init(root: URL? = nil) {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let preview = Bundle.main.object(forInfoDictionaryKey: "CodexPPPreview") as? Bool == true
        store = ExtensionStore(root: root ?? (preview ? FileManager.default.temporaryDirectory.appendingPathComponent("CodexPP-Preview") : support.appendingPathComponent("CodexPP")))
        bootstrap = (try? String(contentsOf: Bundle.module.url(forResource: "runtime", withExtension: "js")!, encoding: .utf8)) ?? ""
        bridgeSource = (try? String(contentsOf: Bundle.module.url(forResource: "bridge", withExtension: "js")!, encoding: .utf8)) ?? ""
        settingsSource = (try? String(contentsOf: Bundle.module.url(forResource: "settings", withExtension: "js")!, encoding: .utf8)) ?? ""
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
    var appName: String { URL(fileURLWithPath: settings.appPath).deletingPathExtension().lastPathComponent }
    var extensionErrorStatus: String? {
        guard !runtimeErrors.isEmpty else { return nil }
        return runtimeErrors.count == 1 ? "1 extension error" : "\(runtimeErrors.count) extension errors"
    }
    var status: String {
        if busy { return "Working…" }
        if settings.extensionsPaused { return running ? "Running without extensions" : "Extensions paused" }
        if connected { return extensionErrorStatus ?? "Connected to \(appName)" }
        return running ? "Restart to connect extensions" : "\(appName) is closed"
    }
    var codexApp: NSRunningApplication? {
        guard !isPreview else { return nil }
        let selected = URL(fileURLWithPath: settings.appPath).resolvingSymlinksInPath()
        return NSWorkspace.shared.runningApplications.first { $0.bundleURL?.resolvingSymlinksInPath() == selected }
    }
    func startMonitoring() {
        guard monitor == nil, !isPreview else { return }
        monitor = Task { [weak self] in
            while !Task.isCancelled {
                await self?.poll()
                try? await Task.sleep(for: .seconds(3))
            }
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
    private func ownsEndpoint() async throws -> Bool {
        guard let app = codexApp else { return false }
        let result = try await runCommand("/usr/sbin/lsof", ["-nP", "-a", "-p", String(app.processIdentifier), "-iTCP:\(settings.port)", "-sTCP:LISTEN", "-Fpn"])
        // Refuse a listener exposed to the network or owned by another app.
        let names = result.output.split(separator: "\n").filter { $0.hasPrefix("n") }
        return result.status == 0 && !names.isEmpty && names.allSatisfy { $0 == "n127.0.0.1:\(settings.port)" || $0 == "n[::1]:\(settings.port)" }
    }
    func poll(force: Bool = false) async {
        guard !isPreview, (!busy || force), configurationReadable, !polling else { return }
        polling = true
        defer { polling = false; writeDiagnostics() }
        running = codexApp != nil
        guard running else {
            for session in settingsSessions.values { session.close() }; settingsSessions.removeAll()
            connected = false; activeCount = 0; statusChanged?(); return
        }
        do {
            guard hasPatchedApp else { throw HelperError.message("Restart ChatGPT from the helper to install Extensions support.") }
            let appURL = URL(fileURLWithPath: settings.appPath).resolvingSymlinksInPath()
            let paths = ["Contents/Resources/app.asar", "Contents/Info.plist", "Contents/Resources/codexpp-patch.json", PatchAdapter.current.frameworkPath!]
            let stamp = try paths.map { path in
                let attributes = try appURL.appendingPathComponent(path).resourceValues(forKeys: [.contentModificationDateKey, .fileSizeKey])
                return "\(appURL.path)/\(path):\(attributes.contentModificationDate?.timeIntervalSince1970 ?? 0):\(attributes.fileSize ?? 0)"
            }.joined(separator: "|")
            if validatedPatchStamp != stamp {
                let patcher = AppPatcher(support: store.root, helper: Bundle.main.bundleURL, port: settings.port)
                let report = try await Task.detached { try patcher.status(appURL) }.value
                guard report.state == "patched" else { throw HelperError.message("ChatGPT's Extensions support needs to be installed again.") }
                validatedPatchStamp = stamp
            }
            guard try await ownsEndpoint() else { connected = false; activeCount = 0; statusChanged?(); return }
            let client = CDPClient(port: settings.port)
            let targets = try await client.targets()
            var errors: [String: String] = [:], active = Set<String>()
            let liveIDs = Set(targets.map(\.id))
            for id in Array(settingsSessions.keys) where !liveIDs.contains(id) { settingsSessions.removeValue(forKey: id)?.close() }
            for target in targets {
                try await updateSettings(target)
                let states = try await client.synchronize(target, bootstrap: bootstrap, extensions: settings.extensionsPaused ? [] : extensions.filter(isEnabled))
                for state in states {
                    if let error = state.error { errors[state.id] = error }
                    else if state.state == "active" { active.insert(state.id) }
                }
            }
            connected = !targets.isEmpty; runtimeErrors = errors; activeCount = active.subtracting(errors.keys).count
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
            var snapshot: [String: Any] = ["schema": 1, "pid": ProcessInfo.processInfo.processIdentifier, "running": running, "connected": connected, "installedExtensions": extensions.count, "activeExtensions": activeCount, "settingsSessions": settingsSessions.count, "extensionsPaused": settings.extensionsPaused, "time": ISO8601DateFormatter().string(from: Date())]
            snapshot["runtimeErrors"] = runtimeErrors
            if let connectionError { snapshot["error"] = connectionError }
            let file = directory.appendingPathComponent("helper.json")
            try JSONSerialization.data(withJSONObject: snapshot, options: [.sortedKeys]).write(to: file, options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        } catch { /* Diagnostics must never prevent extensions from running. */ }
    }
    private func settingsSnapshot() -> [String: Any] {
        let rows: [[String: Any]] = extensions.map { item in
            var row: [String: Any] = ["id": item.id, "name": item.manifest.name, "description": item.manifest.description ?? "", "version": item.manifest.version, "enabled": isEnabled(item)]
            if let error = runtimeErrors[item.id] { row["error"] = error }
            return row
        }
        return ["extensions": rows, "extensionsPaused": settings.extensionsPaused, "intent": settingsIntent, "selectedExtensionId": selectedExtensionID ?? ""]
    }
    private func json(_ value: Any) throws -> String {
        String(decoding: try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .fragmentsAllowed]), as: UTF8.self)
    }
    private func updateSettings(_ target: CDPTarget) async throws {
        let session: SettingsSession
        if let current = settingsSessions[target.id], !current.closed { session = current }
        else {
            session = try SettingsSession(target: target, port: settings.port)
            settingsSessions[target.id] = session
            session.onRequest = { [weak self] request, contextID, session in
                await self?.handleSettings(request, contextID: contextID, session: session)
            }
            do { try await session.prepare() }
            catch { session.close(); settingsSessions.removeValue(forKey: target.id); throw error }
        }
        let bridge = bridgeSource.replacingOccurrences(of: "__CODEXPP_SESSION_TOKEN__", with: try json(session.token))
        try await session.evaluate("\(bridge)\n\(settingsSource)\nglobalThis.__codexPPSettings.update(\(try json(settingsSnapshot())))")
    }
    private func handleSettings(_ request: SettingsRequest, contextID: Int, session: SettingsSession) async {
        var response: [String: Any]
        do {
            switch request.action {
            case "state": break
            case "folder": showFiles()
            case "set-enabled", "remove":
                guard let item = extensions.first(where: { $0.id == request.extensionId }) else { throw HelperError.message("This extension is no longer installed.") }
                try await operate {
                    var next = self.settings
                    if request.action == "remove" { next.enabled[item.id] = false }
                    else {
                        guard let enabled = request.enabled else { throw HelperError.message("Missing extension selection.") }
                        next.enabled[item.id] = enabled
                    }
                    try self.save(next)
                    await self.poll(force: true)
                    if request.action == "remove" {
                        try FileManager.default.trashItem(at: item.directory, resultingItemURL: nil)
                        try self.reloadExtensions()
                    }
                }
            case "install":
                try await operate { try await self.importExtension() }
            case "resume", "pause":
                try await operate {
                    var next = self.settings; next.extensionsPaused = request.action == "pause"
                    try self.save(next); await self.poll(force: true)
                }
            default: throw HelperError.message("Unknown extension action.")
            }
            response = ["ok": true, "data": settingsSnapshot()]
        } catch { response = ["ok": false, "error": error.localizedDescription] }
        if let expression = try? "globalThis.__codexPPBridge?.resolve(\(json(request.requestId)), \(json(response)))" {
            try? await session.evaluate(expression, contextID: contextID)
        }
    }
    private func unload() async throws {
        guard try await ownsEndpoint() else {
            for session in settingsSessions.values { session.close() }; settingsSessions.removeAll()
            return
        }
        let client = CDPClient(port: settings.port)
        for target in try await client.targets() {
            let states = try await client.synchronize(target, bootstrap: bootstrap, extensions: [])
            if let error = states.first(where: { $0.error != nil })?.error { throw HelperError.message(error) }
        }
        activeCount = 0
        for session in settingsSessions.values { await session.shutdown() }; settingsSessions.removeAll()
    }
    func restart(extensionsPaused: Bool) {
        perform { try await self.restartNow(extensionsPaused: extensionsPaused) }
    }
    func restoreOriginal() {
        perform {
            guard !self.isPreview else { throw HelperError.message("Restoration is disabled in the preview.") }
            let url = URL(fileURLWithPath: self.settings.appPath).resolvingSymlinksInPath()
            let patcher = AppPatcher(support: self.store.root, helper: Bundle.main.bundleURL, port: self.settings.port)
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
        let patcher = AppPatcher(support: store.root, helper: Bundle.main.bundleURL, port: settings.port)
        // Stage and probe before asking the running desktop app to quit.
        _ = try await Task.detached { try patcher.prepare(appURL) }.value
        var next = settings; next.extensionsPaused = extensionsPaused
        try save(next)
        // Terminating the renderer also clears extensions with incomplete cleanup.
        if let app = codexApp {
            guard app.terminate() else { throw HelperError.message("\(appName) could not quit. Close it manually and try again.") }
            for _ in 0..<40 {
                if app.isTerminated { break }
                try await Task.sleep(for: .milliseconds(250))
            }
            guard app.isTerminated else { throw HelperError.message("\(appName) is still open. Finish any quit dialog, then try again.") }
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
        config.arguments = ["--remote-debugging-port=\(settings.port)", "--remote-debugging-address=127.0.0.1"]
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
            if self.codexApp == nil {
                configuration.arguments = ["--remote-debugging-port=\(self.settings.port)", "--remote-debugging-address=127.0.0.1"]
            }
            if manageExtensions { self.settingsIntent += 1; self.selectedExtensionID = extensionID }
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
