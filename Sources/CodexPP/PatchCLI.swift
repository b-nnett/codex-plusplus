import AppKit
import Darwin
import CodexPPCore

enum PatchCLI {
    @MainActor static func runIfRequested() -> Bool {
        let args = ProcessInfo.processInfo.arguments
        guard args.count > 1, ["--patch-status", "--check-probe", "--stage-patch", "--patch-app", "--patch-and-restart", "--restore-app", "--recover-patch", "--restart-helper", "--begin-update-validation", "--finish-background-update-validation", "--finish-self-update"].contains(args[1]) else { return false }
        do {
            if args[1] == "--finish-self-update", args.count == 3 {
                try finishSelfUpdate(ticketPath: args[2])
                return true
            }
            if args[1] == "--finish-background-update-validation" {
                let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("CodexPP")
                let settings = try ExtensionStore(root: support).readSettings()
                let app = URL(fileURLWithPath: settings.appPath).resolvingSymlinksInPath()
                let data = try Data(contentsOf: UpdateHandoff.file(in: support))
                let ticket = try JSONDecoder().decode(UpdateHandoff.self, from: data)
                try ticket.validate(app: app, helper: Bundle.main.bundleURL)
                let fields = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                let adapter = try PatchAdapter.forBundle(app)
                guard fields?["installMode"] as? String == "on-quit", ticket.targetBuild == PatchAdapter.current.build,
                      let sourceBuild = UInt64(adapter.build), let targetBuild = UInt64(ticket.targetBuild), sourceBuild < targetBuild,
                      try AppPatcher(support:support,helper:Bundle.main.bundleURL,adapter:adapter).status(app).state == "patched",
                      let running = NSWorkspace.shared.runningApplications.first(where: { $0.bundleURL?.resolvingSymlinksInPath() == app && $0.processIdentifier == ticket.oldPID }) else { throw PatchError.invalid("There is no verified normal background update ready for this running app.") }
                guard running.terminate() else { throw PatchError.invalid("The source app could not quit for its prepared background update.") }
                let deadline = Date().addingTimeInterval(60)
                while ProcessLiveness.isAlive(running.processIdentifier) && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
                guard !ProcessLiveness.isAlive(running.processIdentifier) else { throw PatchError.invalid("The source app is still finishing its quit. Sparkle and the helper retain the update handoff.") }
                print("Quit the source app for Sparkle's prepared install-on-quit update. The helper owns repatch and restart.")
                return true
            }
            if args[1] == "--begin-update-validation" {
                guard args.count == 3 else { throw PatchError.invalid("Provide the staged previous ChatGPT.app bundle.") }
                let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("CodexPP")
                let settings = try ExtensionStore(root: support).readSettings()
                let app = URL(fileURLWithPath: settings.appPath).resolvingSymlinksInPath()
                let previous = URL(fileURLWithPath: args[2]).resolvingSymlinksInPath()
                let sourceAdapter = try PatchAdapter.forBundle(previous)
                guard previous != app, sourceAdapter.isReviewed,
                      let sourceBuild = UInt64(sourceAdapter.build), let latestBuild = UInt64(PatchAdapter.current.build), sourceBuild < latestBuild,
                      try PatchAdapter.forBundle(app).id == PatchAdapter.current.id else { throw PatchError.invalid("Update validation requires an authenticated older release and the current release.") }
                for (url, adapter) in [(app, PatchAdapter.current), (previous, sourceAdapter)] {
                    guard try AppPatcher(support:support,helper:Bundle.main.bundleURL,adapter:adapter).status(url).state == "patched" else { throw PatchError.invalid("Both validation bundles must be verified patches.") }
                }
                if let running = NSWorkspace.shared.runningApplications.first(where: { $0.bundleURL?.resolvingSymlinksInPath() == app && ProcessLiveness.isAlive($0.processIdentifier) }) {
                    guard running.terminate() else { throw PatchError.invalid("ChatGPT could not quit for update validation.") }
                    let deadline = Date().addingTimeInterval(60)
                    while ProcessLiveness.isAlive(running.processIdentifier) && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
                    guard !ProcessLiveness.isAlive(running.processIdentifier) else { throw PatchError.invalid("ChatGPT is still open; the previous release has not been installed.") }
                }
                guard renameatx_np(AT_FDCWD, app.path, AT_FDCWD, previous.path, UInt32(RENAME_SWAP)) == 0 else { throw PatchError.invalid("Could not atomically install the previous release for validation.") }
                do { try launch(app) }
                catch { _ = renameatx_np(AT_FDCWD, app.path, AT_FDCWD, previous.path, UInt32(RENAME_SWAP)); throw error }
                print("Opened previous release \(sourceAdapter.version). Current patched bundle preserved at \(previous.path).")
                return true
            }
            if args[1] == "--restart-helper" {
                try stopHelper()
                try launch(Bundle.main.bundleURL)
                print("Restarted Codex++ helper.")
                return true
            }
            let app = URL(fileURLWithPath: args.count > 2 ? args[2] : "/Applications/ChatGPT.app").standardizedFileURL.resolvingSymlinksInPath()
            let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("CodexPP")
            let adapter = try PatchAdapter.forBundle(app)
            let patcher = AppPatcher(support: support, helper: Bundle.main.bundleURL, adapter: adapter, onProgress: { phase in
                if ProcessInfo.processInfo.environment["CODEXPP_PATCH_TRACE"] == "1" {
                    FileHandle.standardError.write(Data("\(ISO8601DateFormatter().string(from: Date())) \(phase)\n".utf8))
                }
            })
            var requiresClosedApp = ["--patch-app", "--restore-app"].contains(args[1])
            if args[1] == "--recover-patch" { requiresClosedApp = try patcher.status(app).state != "unpatched" }
            if requiresClosedApp {
                guard !NSWorkspace.shared.runningApplications.contains(where: { $0.bundleURL?.resolvingSymlinksInPath() == app && ProcessLiveness.isAlive($0.processIdentifier) }) else { throw PatchError.invalid("Close ChatGPT before changing its installed bundle. Staging can run while ChatGPT is open.") }
            }
            let report: PatchReport
            switch args[1] {
            case "--check-probe":
                try patcher.checkStartup(app)
                report = try patcher.status(app)
            case "--patch-and-restart":
                let receiptURL = app.appendingPathComponent("Contents/Resources/codexpp-patch.json")
                let installedReceipt = FileManager.default.fileExists(atPath: receiptURL.path)
                    ? try JSONDecoder().decode(PatchReceipt.self, from: Data(contentsOf: receiptURL)) : nil
                let needsUpgrade = installedReceipt.map { $0.adapter != adapter.id } ?? false
                _ = try patcher.prepare(app)
                if let running = NSWorkspace.shared.runningApplications.first(where: { $0.bundleURL?.resolvingSymlinksInPath() == app && ProcessLiveness.isAlive($0.processIdentifier) }) {
                    guard running.terminate() else { throw PatchError.invalid("ChatGPT could not quit. The staged patch has not been installed.") }
                    let deadline = Date().addingTimeInterval(60)
                    while ProcessLiveness.isAlive(running.processIdentifier) && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
                    guard !ProcessLiveness.isAlive(running.processIdentifier) else { throw PatchError.invalid("ChatGPT is still open. Finish any quit dialog before installing the verified patch.") }
                }
                do {
                    // prepare staged any upgrade from the verified original while
                    // the old patch stayed installed; install only commits it.
                    report = try patcher.install(app)
                    if needsUpgrade { try stopHelper() }
                }
                catch { try? launch(app); throw error }
                try launch(app)
            case "--stage-patch":
                let stage = try patcher.stage(app); try patcher.probe(stage)
                print("Verified stage: \(stage.path)")
                report = try patcher.status(stage)
            case "--patch-app": report = try patcher.install(app)
            case "--restore-app": report = try patcher.restore(app)
            case "--recover-patch": try patcher.recover(app); report = try patcher.status(app)
            default: report = try patcher.status(app)
            }
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
            print(String(decoding: try encoder.encode(report), as: UTF8.self))
            return true
        } catch {
            FileHandle.standardError.write(Data("Codex++: \(error.localizedDescription)\n".utf8))
            exit(1)
        }
    }
    private static func stopHelper() throws {
        let helper = Bundle.main.bundleURL.resolvingSymlinksInPath()
        for running in NSWorkspace.shared.runningApplications where
            running.processIdentifier != ProcessInfo.processInfo.processIdentifier &&
            running.bundleURL?.resolvingSymlinksInPath() == helper && ProcessLiveness.isAlive(running.processIdentifier) {
            guard running.terminate() else { throw PatchError.invalid("The old Codex++ helper could not quit.") }
            let deadline = Date().addingTimeInterval(20)
            while ProcessLiveness.isAlive(running.processIdentifier) && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
            guard !ProcessLiveness.isAlive(running.processIdentifier) else { throw PatchError.invalid("The old Codex++ helper is still running. Finish its quit dialog before restarting it.") }
        }
    }
    private static func launch(_ app: URL) throws {
        let process = Process(); process.executableURL = URL(fileURLWithPath: "/usr/bin/open"); process.arguments = ["-n", app.path]
        try process.run(); process.waitUntilExit()
        guard process.terminationStatus == 0 else { throw PatchError.invalid("The app could not be opened. The original backup remains available.") }
    }
    /// Run by the staged helper after the user chose to update: waits for the
    /// old helper to quit, swaps the bundles, launches the new helper and
    /// confirms it is running; otherwise restores and relaunches the old one.
    @MainActor static func finishSelfUpdate(ticketPath: String) throws {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("CodexPP")
        let ticketURL = URL(fileURLWithPath: ticketPath)
        guard ticketURL.standardizedFileURL == support.appendingPathComponent("Updates/self-update.json").standardizedFileURL else { throw PatchError.invalid("Unexpected update ticket.") }
        let ticket = try JSONDecoder().decode(SelfUpdateTicket.self, from: Data(contentsOf: ticketURL))
        let installed = URL(fileURLWithPath: ticket.installedPath), staged = URL(fileURLWithPath: ticket.stagedPath)
        guard Date().timeIntervalSince(ticket.createdAt) < 600, staged.standardizedFileURL == Bundle.main.bundleURL.standardizedFileURL,
              SelfUpdate.info(staged)?["CFBundleShortVersionString"] as? String == ticket.version else { throw PatchError.invalid("The update ticket does not match this build.") }
        try LocalSigningIdentity.validate(helper: staged, support: support)
        let deadline = Date().addingTimeInterval(60)
        while ProcessLiveness.isAlive(ticket.oldPID) && Date() < deadline { usleep(200_000) }
        guard !ProcessLiveness.isAlive(ticket.oldPID) else { throw PatchError.invalid("The running Codex++ did not quit.") }
        let previous = try SelfUpdate.swap(installed: installed, staged: staged)
        func launch() { _ = try? runProcess("/usr/bin/open", ["-n", installed.path]) }
        launch()
        // Healthy: a helper runs from the installed path with the new version.
        var healthy = false
        for _ in 0..<120 {
            usleep(500_000)
            let running = NSWorkspace.shared.runningApplications.contains { $0.bundleIdentifier == "dev.codexpp.helper" && $0.processIdentifier != getpid() &&
                $0.bundleURL?.standardizedFileURL == installed.standardizedFileURL && !$0.isTerminated }
            if running, SelfUpdate.info(installed)?["CFBundleShortVersionString"] as? String == ticket.version { healthy = true; break }
        }
        let result: [String: Any] = ["schema": 1, "version": ticket.version, "installed": healthy, "time": ISO8601DateFormatter().string(from: Date())]
        try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]).write(to: support.appendingPathComponent("Updates/self-update-result.json"), options: .atomic)
        try? FileManager.default.removeItem(at: ticketURL)
        guard healthy else {
            for app in NSWorkspace.shared.runningApplications where app.bundleURL?.standardizedFileURL == installed.standardizedFileURL { app.forceTerminate() }
            try SelfUpdate.rollBack(installed: installed, previous: previous)
            launch()
            throw PatchError.invalid("Codex++ \(ticket.version) did not start; the previous version was restored.")
        }
    }
    private static func runProcess(_ tool: String, _ arguments: [String]) throws -> Int32 {
        let process = Process(); process.executableURL = URL(fileURLWithPath: tool); process.arguments = arguments
        try process.run(); process.waitUntilExit(); return process.terminationStatus
    }
}
