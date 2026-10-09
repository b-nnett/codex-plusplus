import AppKit
import CodexPPCore

enum PatchCLI {
    @MainActor static func runIfRequested() -> Bool {
        let args = ProcessInfo.processInfo.arguments
        guard args.count > 1, ["--patch-status", "--stage-patch", "--patch-app", "--patch-and-restart", "--restore-app", "--recover-patch", "--restart-helper"].contains(args[1]) else { return false }
        do {
            if args[1] == "--restart-helper" {
                try stopHelper()
                try launch(Bundle.main.bundleURL)
                print("Restarted Codex++ helper.")
                return true
            }
            let app = URL(fileURLWithPath: args.count > 2 ? args[2] : "/Applications/ChatGPT.app").standardizedFileURL.resolvingSymlinksInPath()
            let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("CodexPP")
            let patcher = AppPatcher(support: support, helper: Bundle.main.bundleURL)
            var requiresClosedApp = ["--patch-app", "--restore-app"].contains(args[1])
            if args[1] == "--recover-patch" { requiresClosedApp = try patcher.status(app).state != "unpatched" }
            if requiresClosedApp {
                guard !NSWorkspace.shared.runningApplications.contains(where: { $0.bundleURL?.resolvingSymlinksInPath() == app }) else { throw PatchError.invalid("Close ChatGPT before changing its installed bundle. Staging can run while ChatGPT is open.") }
            }
            let report: PatchReport
            switch args[1] {
            case "--patch-and-restart":
                let receiptURL = app.appendingPathComponent("Contents/Resources/codexpp-patch.json")
                let installedReceipt = FileManager.default.fileExists(atPath: receiptURL.path)
                    ? try JSONDecoder().decode(PatchReceipt.self, from: Data(contentsOf: receiptURL)) : nil
                let needsUpgrade = installedReceipt.map { $0.adapter != PatchAdapter.current.id } ?? false
                _ = try patcher.prepare(app)
                if let running = NSWorkspace.shared.runningApplications.first(where: { $0.bundleURL?.resolvingSymlinksInPath() == app }) {
                    guard running.terminate() else { throw PatchError.invalid("ChatGPT could not quit. The staged patch has not been installed.") }
                    let deadline = Date().addingTimeInterval(20)
                    while !running.isTerminated && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
                    guard running.isTerminated else { throw PatchError.invalid("ChatGPT is still open. Finish any quit dialog before installing the verified patch.") }
                }
                do {
                    // prepare verifies an existing patch; upgrade from its verified
                    // original only after the running app has closed.
                    if needsUpgrade { _ = try patcher.restore(app) }
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
            running.bundleURL?.resolvingSymlinksInPath() == helper {
            guard running.terminate() else { throw PatchError.invalid("The old Codex++ helper could not quit.") }
            let deadline = Date().addingTimeInterval(20)
            while !running.isTerminated && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
            guard running.isTerminated else { throw PatchError.invalid("The old Codex++ helper is still running. Finish its quit dialog before restarting it.") }
        }
    }
    private static func launch(_ app: URL) throws {
        let process = Process(); process.executableURL = URL(fileURLWithPath: "/usr/bin/open"); process.arguments = ["-n", app.path]
        try process.run(); process.waitUntilExit()
        guard process.terminationStatus == 0 else { throw PatchError.invalid("The app could not be opened. The original backup remains available.") }
    }
}
