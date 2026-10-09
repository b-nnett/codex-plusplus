import Foundation
import Darwin

public struct PatchReceipt: Codable, Sendable {
    public let schema: Int
    public let adapter: String
    public let version: String
    public let build: String
    public let originalArchiveHash: String
    public let patchedArchiveHash: String
    public let patchedHeaderHash: String
    public let bootstrapHash: String
    public let patchedFrameworkHash: String?
    public let main: String
    public let port: Int
    public let helperPath: String
    public let backupPath: String
    public let installedAt: Date
}

private struct PatchJournal: Codable {
    let schema: Int
    let target: String
    let stage: String
    let backup: String
    let receipt: PatchReceipt
    var phase: String
}

public struct PatchReport: Codable, Sendable {
    public let state: String
    public let appPath: String
    public let version: String
    public let build: String
    public let backupPath: String?
}

/// Installation uses an atomic directory exchange. The old, vendor-signed
/// bundle is retained whole, including its plist, native files and signature.
public struct AppPatcher: Sendable {
    public let support: URL
    public let helper: URL
    public let port: Int
    public let adapter: PatchAdapter
    public init(support: URL, helper: URL, port: Int = 9222, adapter: PatchAdapter = .current) {
        self.support = support; self.helper = helper; self.port = port; self.adapter = adapter
    }
    private var fm: FileManager { FileManager.default }
    private func signingIdentity() throws -> String {
        // Synthetic test adapters use throwaway signatures; real patches require a stable certificate.
        adapter.id == PatchAdapter.current.id ? try LocalSigningIdentity.resolve(support: support) : "-"
    }
    private func archive(_ app: URL) -> URL { app.appendingPathComponent("Contents/Resources/app.asar") }
    private func receiptURL(_ app: URL) -> URL { app.appendingPathComponent("Contents/Resources/codexpp-patch.json") }
    private var journalURL: URL { support.appendingPathComponent("Patching/transaction.json") }
    private func plist(_ app: URL) throws -> [String: Any] {
        let path = app.appendingPathComponent("Contents/Info.plist")
        guard app.pathExtension == "app", app.standardizedFileURL == app.resolvingSymlinksInPath(),
              let info = try PropertyListSerialization.propertyList(from: Data(contentsOf: path), format: nil) as? [String: Any],
              info["CFBundleIdentifier"] as? String == DesktopAppLocator.bundleIdentifier,
              info["CFBundleShortVersionString"] is String, info["CFBundleVersion"] is String else { throw PatchError.invalid("Expected a regular ChatGPT.app bundle (com.openai.codex).") }
        for path in [archive(app), app.appendingPathComponent("Contents/Info.plist")] {
            guard path.standardizedFileURL == path.resolvingSymlinksInPath(), try path.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true else { throw PatchError.invalid("Bundle patch targets must be regular files, without symlinks.") }
        }
        return info
    }
    private func receipt(_ app: URL) throws -> PatchReceipt? {
        guard fm.fileExists(atPath: receiptURL(app).path) else { return nil }
        let result = try JSONDecoder().decode(PatchReceipt.self, from: Data(contentsOf: receiptURL(app)))
        let known = result.adapter == adapter.id || (adapter.id == PatchAdapter.current.id && ["chatgpt-macos-20052-v1", "chatgpt-macos-20052-v2", "chatgpt-macos-20052-v3", "chatgpt-macos-20052-v4", "chatgpt-macos-20052-v5", "chatgpt-macos-20052-v6", "chatgpt-macos-20052-v7", "chatgpt-macos-20052-v8", "chatgpt-macos-20052-v9", "chatgpt-macos-20052-v10", "chatgpt-macos-20052-v11", "chatgpt-macos-20052-v12", "chatgpt-macos-20052-v13", "chatgpt-macos-20052-v14", "chatgpt-macos-20052-v15", "chatgpt-macos-20052-v16", "chatgpt-macos-20052-v17", "chatgpt-macos-20052-v18", "chatgpt-macos-20052-v19"].contains(result.adapter))
        guard result.schema == 1, known, result.main == adapter.main else { throw PatchError.invalid("Unknown patch receipt; refusing to overwrite it.") }
        return result
    }
    private func verifyHeader(_ app: URL, _ info: [String: Any], _ asar: AsarArchive) throws {
        let integrity = info["ElectronAsarIntegrity"] as? [String: Any]
        let entry = integrity?["Resources/app.asar"] as? [String: Any]
        guard entry?["algorithm"] as? String == "SHA256", entry?["hash"] as? String == asar.headerHash else { throw PatchError.invalid("The app's ASAR integrity declaration does not match its archive.") }
    }
    public func status(_ app: URL, verifySignature: Bool = true) throws -> PatchReport {
        let info = try plist(app), asar = try AsarArchive(archive(app))
        try verifyHeader(app, info, asar)
        let version = info["CFBundleShortVersionString"] as! String, build = info["CFBundleVersion"] as! String
        if verifySignature { try command("/usr/bin/codesign", ["--verify", "--deep", "--strict", app.path]) }
        if let receipt = try receipt(app) {
            guard version == receipt.version, build == receipt.build,
                  receipt.patchedHeaderHash == asar.headerHash,
                  try fileSHA256(archive(app)) == receipt.patchedArchiveHash,
                  try sha256(asar.data(at: receipt.main)) == receipt.bootstrapHash else { throw PatchError.invalid("The patched app was changed after installation. Restore or reinstall the official app before patching again.") }
            if let relative = adapter.frameworkPath {
                guard let hash = receipt.patchedFrameworkHash, try fileSHA256(app.appendingPathComponent(relative)) == hash else { throw PatchError.invalid("The patched Electron framework failed verification.") }
            }
            return PatchReport(state: "patched", appPath: app.path, version: version, build: build, backupPath: receipt.backupPath)
        }
        _ = try adapter.validate(version: version, build: build, archive: asar)
        if let relative = adapter.frameworkPath { guard try fileSHA256(app.appendingPathComponent(relative)) == adapter.frameworkHash else { throw PatchError.invalid("The Electron framework does not match the reviewed build.") } }
        return PatchReport(state: "unpatched", appPath: app.path, version: version, build: build, backupPath: nil)
    }
    private func withLock<T>(_ body: () throws -> T) throws -> T {
        try fm.createDirectory(at: journalURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let lockPath = support.appendingPathComponent("Patching/lock")
        let fd = open(lockPath.path, O_CREAT | O_RDWR | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw PatchError.invalid("Cannot open patch transaction lock.") }
        defer { close(fd) }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else { throw PatchError.invalid("Another patch transaction is in progress.") }
        defer { flock(fd, LOCK_UN) }
        return try body()
    }
    private func writeJournal(_ journal: PatchJournal) throws {
        try JSONEncoder().encode(journal).write(to: journalURL, options: .atomic)
        let handle = try FileHandle(forWritingTo: journalURL); defer { try? handle.close() }; try handle.synchronize()
    }
    private func exchange(_ first: URL, _ second: URL) throws {
        guard renameatx_np(AT_FDCWD, first.path, AT_FDCWD, second.path, UInt32(RENAME_SWAP)) == 0 else { throw PatchError.invalid("Atomic app exchange failed: \(String(cString: strerror(errno)))") }
    }
    private func validatedJournal(_ app: URL) throws -> PatchJournal {
        let journal = try JSONDecoder().decode(PatchJournal.self, from: Data(contentsOf: journalURL))
        let parent = app.deletingLastPathComponent()
        guard journal.schema == 1, journal.target == app.path,
              URL(fileURLWithPath: journal.stage).deletingLastPathComponent() == parent,
              URL(fileURLWithPath: journal.backup).deletingLastPathComponent() == parent,
              URL(fileURLWithPath: journal.stage).lastPathComponent.hasPrefix(".ChatGPT.codexpp-stage-"),
              URL(fileURLWithPath: journal.backup).lastPathComponent.hasPrefix(".ChatGPT.codexpp-original-") else { throw PatchError.invalid("Invalid patch recovery journal.") }
        return journal
    }
    /// Builds and signs a separate copy. The target remains untouched.
    public func stage(_ app: URL) throws -> URL {
        try withLock {
            guard !fm.fileExists(atPath: journalURL.path) else { throw PatchError.invalid("A pending patch transaction exists. Commit or recover it first.") }
            guard try status(app).state == "unpatched" else { throw PatchError.invalid("ChatGPT is already patched.") }
            guard Bundle(url: helper)?.bundleIdentifier == "dev.codexpp.helper" else { throw PatchError.invalid("Build Codex++.app before patching.") }
            try command("/usr/bin/codesign", ["--verify", "--deep", "--strict", helper.path])
            let info = try plist(app), original = try AsarArchive(archive(app))
            let source = try adapter.validate(version: info["CFBundleShortVersionString"] as! String, build: info["CFBundleVersion"] as! String, archive: original)
            let bootstrap = try adapter.bootstrap(original: source, port: port, helper: helper, support: support)
            let id = UUID().uuidString, parent = app.deletingLastPathComponent()
            let stage = parent.appendingPathComponent(".ChatGPT.codexpp-stage-\(id).app")
            let backup = parent.appendingPathComponent(".ChatGPT.codexpp-original-\(id).app")
            do {
                try command("/usr/bin/ditto", [app.path, stage.path], timeout: 120)
                let stagedArchive = archive(stage), temporary = stagedArchive.appendingPathExtension("next")
                var headerHash = try AsarArchive(stagedArchive).replacing(adapter.main, with: bootstrap, output: temporary)
                try fm.removeItem(at: stagedArchive); try fm.moveItem(at: temporary, to: stagedArchive)
                if adapter.id == PatchAdapter.current.id {
                    let resources = helper.appendingPathComponent("Contents/Resources")
                    let bundles = try fm.contentsOfDirectory(at: resources, includingPropertiesForKeys: nil).filter { $0.pathExtension == "bundle" }
                    guard let runtimeURL = bundles.compactMap({ Bundle(url: $0)?.url(forResource: "native-settings", withExtension: "js") }).first else { throw PatchError.invalid("The helper's native Settings runtime is missing.") }
                    let runtime = try String(contentsOf: runtimeURL, encoding: .utf8)
                    let discovery = try NativeSettingsAdapter.discover(archive: original, runtime: runtime)
                    try JSONEncoder().encode(discovery.report).write(to: stage.appendingPathComponent("Contents/Resources/codexpp-settings-discovery.json"), options: .atomic)
                    let (shellPath, shellSource) = try ShellAdapter.discover(archive: original, replacements: discovery.patches)
                    for (path, renderer) in discovery.patches.filter({ $0.0 != shellPath }) + [(shellPath, shellSource)] {
                        headerHash = try AsarArchive(stagedArchive).replacing(path, with: renderer, output: temporary)
                        try fm.removeItem(at: stagedArchive); try fm.moveItem(at: temporary, to: stagedArchive)
                    }
                    let (browserPath, browserSource) = try NativeBrowserAdapter.patch(archive: original)
                    headerHash = try AsarArchive(stagedArchive).replacing(browserPath, with: browserSource, output: temporary)
                    try fm.removeItem(at: stagedArchive); try fm.moveItem(at: temporary, to: stagedArchive)
                }
                var stagedInfo = info
                var integrity = info["ElectronAsarIntegrity"] as! [String: Any]
                integrity["Resources/app.asar"] = ["algorithm": "SHA256", "hash": headerHash]
                stagedInfo["ElectronAsarIntegrity"] = integrity
                try PropertyListSerialization.data(fromPropertyList: stagedInfo, format: .xml, options: 0).write(to: stage.appendingPathComponent("Contents/Info.plist"), options: .atomic)
                var frameworkHash: String?
                if let relative = adapter.frameworkPath, let offset = adapter.integrityOffset {
                    let binary = stage.appendingPathComponent(relative)
                    let bytes = try Data(contentsOf: binary, options: .mappedIfSafe)
                    guard sha256(bytes) == adapter.frameworkHash else { throw PatchError.invalid("The staged framework is not the reviewed binary.") }
                    let patched = try NativeIntegrityDigest.replacing(bytes, offset: offset, expected: NativeIntegrityDigest.dictionaryHash(info["ElectronAsarIntegrity"] as! [String: Any]), replacement: NativeIntegrityDigest.dictionaryHash(integrity))
                    let handle = try FileHandle(forWritingTo: binary)
                    try handle.seek(toOffset: UInt64(offset + 34)); try handle.write(contentsOf: patched.subdata(in: offset + 34..<offset + 66)); try handle.synchronize(); try handle.close()
                    let framework = stage.appendingPathComponent("Contents/Frameworks/Codex Framework.framework")
                    let helpers = framework.appendingPathComponent("Versions/Current/Helpers")
                    for bundle in try fm.contentsOfDirectory(at: helpers, includingPropertiesForKeys: nil).filter({ $0.pathExtension == "app" }) {
                        let originalBundle = app.appendingPathComponent("Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/\(bundle.lastPathComponent)")
                        try signLocal(bundle, original: originalBundle)
                    }
                    try command("/usr/bin/codesign", ["--force", "--sign", try signingIdentity(), "--preserve-metadata=flags", framework.path], timeout: 120)
                    frameworkHash = try fileSHA256(binary)
                }
                let receipt = PatchReceipt(schema: 1, adapter: adapter.id, version: adapter.version, build: adapter.build, originalArchiveHash: try fileSHA256(archive(app)), patchedArchiveHash: try fileSHA256(stagedArchive), patchedHeaderHash: headerHash, bootstrapHash: sha256(bootstrap), patchedFrameworkHash: frameworkHash, main: adapter.main, port: port, helperPath: helper.path, backupPath: backup.path, installedAt: Date())
                try JSONEncoder().encode(receipt).write(to: receiptURL(stage), options: .atomic)
                try signLocal(stage, original: app)
                _ = try status(stage)
                // Detect vendor updater changes while staging, before committing.
                guard try fileSHA256(archive(app)) == receipt.originalArchiveHash, try plist(app)["CFBundleVersion"] as? String == receipt.build else { throw PatchError.invalid("ChatGPT changed during staging. Retry against the updated app.") }
                try writeJournal(PatchJournal(schema: 1, target: app.path, stage: stage.path, backup: backup.path, receipt: receipt, phase: "prepared"))
                return stage
            } catch { try? fm.removeItem(at: stage); throw error }
        }
    }
    private func signLocal(_ bundle: URL, original: URL) throws {
        let metadata = try command("/usr/bin/codesign", ["-d", "--entitlements", ":-", original.path])
        let text = String(decoding: metadata, as: UTF8.self)
        var originalEntitlements: [String: Any] = [:]
        if let start = text.range(of: "<?xml"), let end = text.range(of: "</plist>") {
            originalEntitlements = try PropertyListSerialization.propertyList(from: Data(text[start.lowerBound..<end.upperBound].utf8), format: nil) as? [String: Any] ?? [:]
        }
        let entitlements = support.appendingPathComponent("Patching/signing-\(UUID().uuidString).plist")
        defer { try? fm.removeItem(at: entitlements) }
        try PropertyListSerialization.data(fromPropertyList: PatchSigningPolicy.localEntitlements(originalEntitlements), format: .xml, options: 0).write(to: entitlements, options: .atomic)
        try command("/usr/bin/codesign", ["--force", "--sign", try signingIdentity(), "--preserve-metadata=flags", "--entitlements", entitlements.path, bundle.path], timeout: 120)
    }
    /// Caller must close ChatGPT before committing/restoring/recovering.
    public func commit(_ app: URL) throws -> PatchReport {
        try withLock {
            var journal = try validatedJournal(app)
            guard journal.phase == "verified" else { throw PatchError.invalid("The staged app must pass its startup probe before installation.") }
            let stage = URL(fileURLWithPath: journal.stage), backup = URL(fileURLWithPath: journal.backup)
            _ = try status(stage)
            guard try status(app).state == "unpatched", try fileSHA256(archive(app)) == journal.receipt.originalArchiveHash else { throw PatchError.invalid("The original app changed. Recover the staged transaction before retrying.") }
            journal.phase = "exchanging"; try writeJournal(journal)
            try exchange(app, stage)
            do {
                let result = try status(app)
                try fm.moveItem(at: stage, to: backup)
                journal.phase = "committed"; try writeJournal(journal)
                try fm.removeItem(at: journalURL)
                return result
            } catch {
                let original = fm.fileExists(atPath: stage.path) ? stage : backup
                try exchange(app, original)
                try? fm.removeItem(at: original); try? fm.removeItem(at: journalURL)
                throw error
            }
        }
    }
    public func install(_ app: URL) throws -> PatchReport {
        if let installed = try receipt(app), installed.adapter != adapter.id { _ = try restore(app) }
        if try prepare(app) == nil { return try status(app) }
        return try commit(app)
    }
    public func prepare(_ app: URL) throws -> URL? {
        if fm.fileExists(atPath: journalURL.path) {
            let journal = try validatedJournal(app)
            guard journal.phase == "prepared" || journal.phase == "verified",
                  try fileSHA256(archive(app)) == journal.receipt.originalArchiveHash else { throw PatchError.invalid("Interrupted installation requires recovery before continuing.") }
            let stage = URL(fileURLWithPath: journal.stage)
            _ = try status(stage)
            if journal.phase == "prepared" { try probe(stage) }
            return stage
        }
        if try status(app).state == "patched" { return nil }
        let stage = try stage(app)
        try probe(stage)
        return stage
    }
    public func recover(_ app: URL) throws {
        try withLock {
            guard fm.fileExists(atPath: journalURL.path) else { return }
            let journal = try validatedJournal(app)
            let stage = URL(fileURLWithPath: journal.stage), backup = URL(fileURLWithPath: journal.backup)
            if journal.phase == "committed" {
                _ = try status(app)
                guard try fileSHA256(archive(backup)) == journal.receipt.originalArchiveHash else { throw PatchError.invalid("The recovery backup failed verification.") }
            } else if try fileSHA256(archive(app)) == journal.receipt.patchedArchiveHash {
                let original = fm.fileExists(atPath: stage.path) ? stage : backup
                guard try fileSHA256(archive(original)) == journal.receipt.originalArchiveHash else { throw PatchError.invalid("The original recovery bundle failed verification.") }
                try command("/usr/bin/codesign", ["--verify", "--deep", "--strict", original.path])
                try exchange(app, original); try fm.removeItem(at: original)
            } else {
                guard try fileSHA256(archive(app)) == journal.receipt.originalArchiveHash else { throw PatchError.invalid("App changed during recovery; refusing to replace it.") }
                if fm.fileExists(atPath: stage.path) { try fm.removeItem(at: stage) }
            }
            try fm.removeItem(at: journalURL)
        }
    }
    public func restore(_ app: URL) throws -> PatchReport {
        try withLock {
            guard !fm.fileExists(atPath: journalURL.path), let receipt = try receipt(app) else { throw PatchError.invalid("Recover any pending transaction before restoring a patched app.") }
            _ = try status(app)
            let backup = URL(fileURLWithPath: receipt.backupPath)
            guard backup.deletingLastPathComponent() == app.deletingLastPathComponent(), backup.lastPathComponent.hasPrefix(".ChatGPT.codexpp-original-"),
                  try fileSHA256(archive(backup)) == receipt.originalArchiveHash, try status(backup).state == "unpatched" else { throw PatchError.invalid("The original app backup failed verification.") }
            // The same transaction recovery path handles interrupted restoration.
            let journal = PatchJournal(schema: 1, target: app.path, stage: backup.path.replacingOccurrences(of: ".codexpp-original-", with: ".codexpp-stage-"), backup: backup.path, receipt: receipt, phase: "restoring")
            try writeJournal(journal)
            try exchange(app, backup)
            _ = try status(app)
            // Keep the patched copy as well until the original has verified.
            try fm.removeItem(at: journalURL)
            return try status(app)
        }
    }
    public func probe(_ stage: URL) throws {
        _ = try status(stage)
        let info = try plist(stage)
        guard let executable = info["CFBundleExecutable"] as? String, !executable.contains("/"), !executable.isEmpty else { throw PatchError.invalid("Invalid executable name.") }
        let proof = support.appendingPathComponent("Diagnostics/probe.json")
        try? fm.removeItem(at: proof)
        let profile = support.appendingPathComponent("Patching/probe-profile-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: profile) }
        try command(stage.appendingPathComponent("Contents/MacOS/\(executable)").path, ["--codexpp-probe", "--user-data-dir=\(profile.path)"], timeout: 30)
        guard let data = try JSONSerialization.jsonObject(with: Data(contentsOf: proof)) as? [String: Any],
              data["adapter"] as? String == adapter.id, data["port"] as? Int == port,
              data["app"] as? String == archive(stage).path else { throw PatchError.invalid("The staged app failed its startup probe.") }
        try withLock {
            var journal = try JSONDecoder().decode(PatchJournal.self, from: Data(contentsOf: journalURL))
            guard journal.stage == stage.path, journal.phase == "prepared" || journal.phase == "verified" else { throw PatchError.invalid("Probe does not match the pending patch.") }
            journal.phase = "verified"; try writeJournal(journal)
        }
    }
    @discardableResult private func command(_ executable: String, _ arguments: [String], timeout: TimeInterval = 60) throws -> Data {
        let process = Process(); process.executableURL = URL(fileURLWithPath: executable); process.arguments = arguments
        let log = fm.temporaryDirectory.appendingPathComponent("codexpp-command-\(UUID().uuidString).log")
        guard fm.createFile(atPath: log.path, contents: nil) else { throw PatchError.invalid("Cannot create command log.") }
        let out = try FileHandle(forWritingTo: log)
        defer { try? out.close(); try? fm.removeItem(at: log) }
        process.standardOutput = out; process.standardError = out
        try process.run()
        let deadline = Date().addingTimeInterval(timeout)
        while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.05) }
        if process.isRunning {
            process.terminate(); Thread.sleep(forTimeInterval: 0.2)
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            process.waitUntilExit(); throw PatchError.invalid("\(URL(fileURLWithPath: executable).lastPathComponent) timed out; installation was not committed.")
        }
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            let output = String(decoding: try Data(contentsOf: log).suffix(8192), as: UTF8.self)
            throw PatchError.invalid("\(URL(fileURLWithPath: executable).lastPathComponent) failed (\(process.terminationStatus)): \(output)")
        }
        return try Data(contentsOf: log)
    }
}
