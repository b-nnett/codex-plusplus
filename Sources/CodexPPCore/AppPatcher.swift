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
    /// Set when upgrading an installed patch in place: its patched archive hash.
    var replaces: String? = nil
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
    public let onProgress: @Sendable (String) -> Void
    public init(support: URL, helper: URL, port: Int = 9222, adapter: PatchAdapter = .current, onProgress: @escaping @Sendable (String) -> Void = { _ in }) {
        self.support = support; self.helper = helper; self.port = port; self.adapter = adapter; self.onProgress = onProgress
    }
    private var fm: FileManager { FileManager.default }
    private func signingIdentity() throws -> String {
        // Synthetic test adapters use throwaway signatures; real patches require a stable certificate.
        adapter.isReviewed ? try LocalSigningIdentity.resolve(support: support, helper: helper) : "-"
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
        guard result.schema == 1, adapter.accepts(receiptAdapter: result.adapter), result.main == adapter.main else { throw PatchError.invalid("Unknown patch receipt; refusing to overwrite it.") }
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
        if adapter.isReviewed { try VendorUpdateAdapter.authenticate(app) }
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
    private func validatedJournal(_ app: URL? = nil) throws -> PatchJournal {
        let journal = try JSONDecoder().decode(PatchJournal.self, from: Data(contentsOf: journalURL))
        let target = app ?? URL(fileURLWithPath: journal.target)
        let parent = target.deletingLastPathComponent()
        guard journal.schema == 1, journal.target == target.path,
              URL(fileURLWithPath: journal.stage).deletingLastPathComponent() == parent,
              URL(fileURLWithPath: journal.backup).deletingLastPathComponent() == parent,
              URL(fileURLWithPath: journal.stage).lastPathComponent.hasPrefix(".ChatGPT.codexpp-stage-"),
              URL(fileURLWithPath: journal.backup).lastPathComponent.hasPrefix(".ChatGPT.codexpp-original-") else { throw PatchError.invalid("Invalid patch recovery journal.") }
        return journal
    }
    /// Removes stage and original bundles that no transaction or receipt owns.
    /// Callers hold the transaction lock. Only ChatGPT bundles with Codex++
    /// names are considered; receipts in other sibling bundles keep their backups.
    private func pruneLeftovers(_ app: URL) {
        guard !fm.fileExists(atPath: journalURL.path) else { return }
        let parent = app.deletingLastPathComponent()
        guard let names = try? fm.contentsOfDirectory(atPath: parent.path) else { return }
        func owned(_ name: String) -> Bool { name.hasSuffix(".app") && (name.hasPrefix(".ChatGPT.codexpp-stage-") || name.hasPrefix(".ChatGPT.codexpp-original-")) }
        var referenced: Set<String> = []
        for name in names where name.hasSuffix(".app") && !owned(name) {
            if let data = try? Data(contentsOf: receiptURL(parent.appendingPathComponent(name))),
               let receipt = try? JSONDecoder().decode(PatchReceipt.self, from: data) {
                referenced.insert(URL(fileURLWithPath: receipt.backupPath).standardizedFileURL.path)
            }
        }
        for name in names where owned(name) {
            let bundle = parent.appendingPathComponent(name)
            guard !referenced.contains(bundle.standardizedFileURL.path),
                  let data = try? Data(contentsOf: bundle.appendingPathComponent("Contents/Info.plist")),
                  let info = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
                  info["CFBundleIdentifier"] as? String == DesktopAppLocator.bundleIdentifier else { continue }
            try? fm.removeItem(at: bundle)
        }
    }
    private func archiveHash(_ bundle: URL) -> String? {
        fm.fileExists(atPath: archive(bundle).path) ? try? fileSHA256(archive(bundle)) : nil
    }
    private func allocatedSize(of root: URL) throws -> Int64 {
        let keys: Set<URLResourceKey> = [.isRegularFileKey, .fileAllocatedSizeKey, .totalFileAllocatedSizeKey]
        guard let items = fm.enumerator(at: root, includingPropertiesForKeys: Array(keys)) else {
            throw PatchError.invalid("Cannot measure the ChatGPT bundle before staging.")
        }
        var total: Int64 = 0
        for case let item as URL in items {
            let values = try item.resourceValues(forKeys: keys)
            guard values.isRegularFile == true else { continue }
            total += Int64(values.totalFileAllocatedSize ?? values.fileAllocatedSize ?? 0)
        }
        return total
    }
    static func requiredStagingCapacity(bundleAllocatedSize: Int64, archiveSize: Int64) -> Int64 {
        max(0, bundleAllocatedSize) + max(0, archiveSize) + 1_073_741_824
    }
    private func ensureStagingCapacity(_ app: URL, copies: Int64 = 1) throws {
        let parent = app.deletingLastPathComponent()
        let values = try parent.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey, .volumeAvailableCapacityKey])
        let fallback = values.volumeAvailableCapacity.map(Int64.init)
        guard let available = values.volumeAvailableCapacityForImportantUsage ?? fallback else { return }
        let archiveSize = Int64((try archive(app).resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0)
        let required = Self.requiredStagingCapacity(bundleAllocatedSize: copies * (try allocatedSize(of: app)), archiveSize: archiveSize)
        guard available >= required else {
            let formatter = ByteCountFormatter(); formatter.countStyle = .file
            throw PatchError.invalid("Not enough free disk space to stage ChatGPT safely. Free at least \(formatter.string(fromByteCount: required - available)) more and retry.")
        }
    }
    /// Builds and signs a separate copy. The target remains untouched.
    public func stage(_ app: URL) throws -> URL {
        try withLock {
            guard !fm.fileExists(atPath: journalURL.path) else { throw PatchError.invalid("A pending patch transaction exists. Commit or recover it first.") }
            onProgress("Verifying update…")
            pruneLeftovers(app)
            let id = UUID().uuidString, parent = app.deletingLastPathComponent()
            let stage = parent.appendingPathComponent(".ChatGPT.codexpp-stage-\(id).app")
            // An older patch stays installed while its replacement is staged
            // from the verified vendor original it recorded.
            let origin: URL, backup: URL, replaces: String?
            if try status(app).state == "patched", let installed = try receipt(app) {
                guard installed.adapter != adapter.id else { throw PatchError.invalid("ChatGPT is already patched.") }
                let recorded = URL(fileURLWithPath: installed.backupPath)
                guard recorded.lastPathComponent.hasPrefix(".ChatGPT.codexpp-original-"),
                      recorded.standardizedFileURL == recorded.resolvingSymlinksInPath(),
                      archiveHash(recorded) == installed.originalArchiveHash, try status(recorded).state == "unpatched" else { throw PatchError.invalid("The original app backup failed verification.") }
                // Journal exchanges stay within the installation directory.
                backup = recorded.deletingLastPathComponent() == parent ? recorded : parent.appendingPathComponent(".ChatGPT.codexpp-original-\(id).app")
                origin = recorded; replaces = installed.patchedArchiveHash
            } else {
                origin = app; replaces = nil
                backup = parent.appendingPathComponent(".ChatGPT.codexpp-original-\(id).app")
            }
            let copiesBackup = replaces != nil && backup != origin
            guard Bundle(url: helper)?.bundleIdentifier == "dev.codexpp.helper" else { throw PatchError.invalid("Build Codex++.app before patching.") }
            try command("/usr/bin/codesign", ["--verify", "--deep", "--strict", helper.path])
            let identity = try signingIdentity()
            let info = try plist(origin), original = try AsarArchive(archive(origin))
            let source = try adapter.validate(version: info["CFBundleShortVersionString"] as! String, build: info["CFBundleVersion"] as! String, archive: original)
            let bootstrap = try adapter.bootstrap(original: source, port: port, helper: helper, support: support)
            // A cross-volume upgrade also copies the original next to the app.
            try ensureStagingCapacity(origin, copies: copiesBackup ? 2 : 1)
            do {
                onProgress("Preparing update…")
                if copiesBackup {
                    try command("/usr/bin/ditto", [origin.path, backup.path], timeout: 120)
                    guard archiveHash(backup) == archiveHash(origin) else { throw PatchError.invalid("The original app backup failed verification.") }
                }
                try command("/usr/bin/ditto", [origin.path, stage.path], timeout: 120)
                if adapter.isReviewed {
                    let updater = helper.appendingPathComponent("Contents/Resources/Sparkle.framework")
                    guard fm.fileExists(atPath: updater.path) else { throw PatchError.invalid("Build Codex++ with its authenticated updater framework before patching.") }
                    try command("/usr/bin/codesign", ["--verify", "--deep", "--strict", updater.path])
                    let destination = stage.appendingPathComponent("Contents/Frameworks/Sparkle.framework")
                    try fm.removeItem(at: destination)
                    try command("/usr/bin/ditto", [updater.path, destination.path])
                    let policy = helper.appendingPathComponent("Contents/Resources/CodexPPStartup.dylib")
                    guard fm.fileExists(atPath: policy.path), let frameworkPath = adapter.frameworkPath,
                          let executable = info["CFBundleExecutable"] as? String, !executable.contains("/") else { throw PatchError.invalid("The noninteractive startup policy is missing.") }
                    try command("/usr/bin/codesign", ["--verify", "--strict", policy.path])
                    try fm.copyItem(at: policy, to: stage.appendingPathComponent("Contents/Frameworks/CodexPPStartup.dylib"))
                    let launcher = stage.appendingPathComponent("Contents/MacOS/" + executable)
                    try StartupPolicyAdapter.patch(Data(contentsOf: launcher), frameworkPath: frameworkPath).write(to: launcher)
                }
                let stagedArchive = archive(stage), temporary = stagedArchive.appendingPathExtension("next")
                var replacements: [(String, Data)] = [(adapter.main, bootstrap)]
                if adapter.isReviewed, let recipe = try ReviewedPatchRecipe.load(helper: helper, archive: original, adapter: adapter) {
                    onProgress("Preparing extensions…")
                    replacements += try recipe.patches(in: original)
                    try JSONEncoder().encode(recipe.settingsReport).write(to: stage.appendingPathComponent("Contents/Resources/codexpp-settings-discovery.json"), options: .atomic)
                } else if adapter.isReviewed {
                    let resources = helper.appendingPathComponent("Contents/Resources")
                    let bundles = try fm.contentsOfDirectory(at: resources, includingPropertiesForKeys: nil).filter { $0.pathExtension == "bundle" }
                    guard let runtimeURL = bundles.compactMap({ Bundle(url: $0)?.url(forResource: "native-settings", withExtension: "js") }).first else { throw PatchError.invalid("The helper's native Settings runtime is missing.") }
                    let runtime = try String(contentsOf: runtimeURL, encoding: .utf8)
                    onProgress("Adapting extensions…")
                    let discovery = try NativeSettingsAdapter.discover(archive: original, runtime: runtime)
                    try JSONEncoder().encode(discovery.report).write(to: stage.appendingPathComponent("Contents/Resources/codexpp-settings-discovery.json"), options: .atomic)
                    let (shellPath, shellSource) = try ShellAdapter.discover(archive: original, replacements: discovery.patches)
                    let baseRenderers = discovery.patches.filter({ $0.0 != shellPath }) + [(shellPath, shellSource)]
                    let bookmarkRenderers = try BookmarksAdapter.discover(archive: original, replacements: baseRenderers)
                    let bookmarkPaths = Set(bookmarkRenderers.map { $0.0 })
                    var renderers = baseRenderers.filter({ !bookmarkPaths.contains($0.0) }) + bookmarkRenderers
                    // Optional: a sidebar contract mismatch leaves better-sidebar to
                    // report its missing capabilities; it never blocks the patch.
                    if let sidebar = SidebarAdapter.discover(archive: original, replacements: renderers) {
                        renderers = renderers.filter({ $0.0 != sidebar.path }) + [(sidebar.path, sidebar.source)]
                        try JSONEncoder().encode(SidebarDiscoveryReport(missing: sidebar.missing, capabilities: sidebar.report)).write(to: stage.appendingPathComponent("Contents/Resources/codexpp-sidebar-discovery.json"), options: .atomic)
                    }
                    // The startup fast path also edits the main bundle, so it builds
                    // on the browser adapter's output rather than replacing it.
                    let (browserPath, browserSource) = try NativeBrowserAdapter.patch(archive: original)
                    renderers = renderers.filter({ $0.0 != browserPath }) + [(browserPath, browserSource)]
                    // Optional startup fast path: unmatched code stays unpatched.
                    if let startup = StartupAdapter.discover(archive: original, replacements: renderers) {
                        let paths = Set(startup.replacements.map { $0.0 })
                        renderers = renderers.filter({ !paths.contains($0.0) }) + startup.replacements
                        try JSONEncoder().encode(StartupDiscoveryReport(applied: startup.applied, skipped: startup.skipped)).write(to: stage.appendingPathComponent("Contents/Resources/codexpp-startup-discovery.json"), options: .atomic)
                    }
                    replacements += renderers
                }
                let headerHash = try AsarArchive(stagedArchive).replacing(replacements, output: temporary)
                try fm.removeItem(at: stagedArchive); try fm.moveItem(at: temporary, to: stagedArchive)
                var stagedInfo = info
                var integrity = info["ElectronAsarIntegrity"] as! [String: Any]
                integrity["Resources/app.asar"] = ["algorithm": "SHA256", "hash": headerHash]
                stagedInfo["ElectronAsarIntegrity"] = integrity
                try PropertyListSerialization.data(fromPropertyList: stagedInfo, format: .xml, options: 0).write(to: stage.appendingPathComponent("Contents/Info.plist"), options: .atomic)
                onProgress("Signing update…")
                var frameworkHash: String?
                if let relative = adapter.frameworkPath, let offset = adapter.integrityOffset {
                    let binary = stage.appendingPathComponent(relative)
                    let bytes = try Data(contentsOf: binary, options: .mappedIfSafe)
                    guard sha256(bytes) == adapter.frameworkHash else { throw PatchError.invalid("The staged framework is not the reviewed binary.") }
                    let replacement = try NativeIntegrityDigest.dictionaryHash(integrity)
                    try NativeIntegrityDigest.validate(bytes, offset: offset, expected: NativeIntegrityDigest.dictionaryHash(info["ElectronAsarIntegrity"] as! [String: Any]), replacement: replacement)
                    let handle = try FileHandle(forWritingTo: binary)
                    try handle.seek(toOffset: UInt64(offset + 34)); try handle.write(contentsOf: replacement); try handle.synchronize(); try handle.close()
                    let framework = stage.appendingPathComponent("Contents/Frameworks/Codex Framework.framework")
                    let helpers = framework.appendingPathComponent("Versions/Current/Helpers")
                    for bundle in try fm.contentsOfDirectory(at: helpers, includingPropertiesForKeys: nil).filter({ $0.pathExtension == "app" }) {
                        let originalBundle = origin.appendingPathComponent("Contents/Frameworks/Codex Framework.framework/Versions/Current/Helpers/\(bundle.lastPathComponent)")
                        try signLocal(bundle, original: originalBundle, identity: identity)
                    }
                    try command("/usr/bin/codesign", ["--force", "--sign", identity, "--timestamp=none", "--preserve-metadata=flags", framework.path], timeout: 120)
                    frameworkHash = try fileSHA256(binary)
                }
                let receipt = PatchReceipt(schema: 1, adapter: adapter.id, version: adapter.version, build: adapter.build, originalArchiveHash: try fileSHA256(archive(origin)), patchedArchiveHash: try fileSHA256(stagedArchive), patchedHeaderHash: headerHash, bootstrapHash: sha256(bootstrap), patchedFrameworkHash: frameworkHash, main: adapter.main, port: port, helperPath: helper.path, backupPath: backup.path, installedAt: Date())
                try JSONEncoder().encode(receipt).write(to: receiptURL(stage), options: .atomic)
                try signLocal(stage, original: origin, identity: identity)
                onProgress("Verifying patched update…")
                _ = try status(stage)
                // Detect vendor updater changes while staging, before committing.
                guard try fileSHA256(archive(app)) == replaces ?? receipt.originalArchiveHash, archiveHash(backup) == receipt.originalArchiveHash || replaces == nil,
                      try plist(app)["CFBundleVersion"] as? String == receipt.build else { throw PatchError.invalid("ChatGPT changed during staging. Retry against the updated app.") }
                try writeJournal(PatchJournal(schema: 1, target: app.path, stage: stage.path, backup: backup.path, receipt: receipt, phase: "prepared", replaces: replaces))
                return stage
            } catch {
                try? fm.removeItem(at: stage)
                if copiesBackup { try? fm.removeItem(at: backup) }
                throw error
            }
        }
    }
    private func signLocal(_ bundle: URL, original: URL, identity: String) throws {
        let metadata = try command("/usr/bin/codesign", ["-d", "--entitlements", ":-", original.path])
        let text = String(decoding: metadata, as: UTF8.self)
        var originalEntitlements: [String: Any] = [:]
        if let start = text.range(of: "<?xml"), let end = text.range(of: "</plist>") {
            originalEntitlements = try PropertyListSerialization.propertyList(from: Data(text[start.lowerBound..<end.upperBound].utf8), format: nil) as? [String: Any] ?? [:]
        }
        let entitlements = support.appendingPathComponent("Patching/signing-\(UUID().uuidString).plist")
        defer { try? fm.removeItem(at: entitlements) }
        try PropertyListSerialization.data(fromPropertyList: PatchSigningPolicy.localEntitlements(originalEntitlements), format: .xml, options: 0).write(to: entitlements, options: .atomic)
        // Local patches keep their Developer ID and hardened-runtime flags.
        // Distribution timestamps are unnecessary; avoid a network round trip
        // for every nested bundle during an update.
        try command("/usr/bin/codesign", ["--force", "--sign", identity, "--timestamp=none", "--preserve-metadata=flags", "--entitlements", entitlements.path, bundle.path], timeout: 120)
    }
    /// Caller must close ChatGPT before committing/restoring/recovering.
    public func commit(_ app: URL) throws -> PatchReport {
        onProgress("Installing patched update…")
        return try withLock {
            var journal = try validatedJournal(app)
            guard journal.phase == "verified" else { throw PatchError.invalid("The staged app must pass its startup probe before installation.") }
            let stage = URL(fileURLWithPath: journal.stage), backup = URL(fileURLWithPath: journal.backup)
            _ = try status(stage)
            let installed = journal.replaces.map { ("patched", $0) } ?? ("unpatched", journal.receipt.originalArchiveHash)
            guard try status(app).state == installed.0, try fileSHA256(archive(app)) == installed.1,
                  journal.replaces == nil || archiveHash(backup) == journal.receipt.originalArchiveHash else { throw PatchError.invalid("The original app changed. Recover the staged transaction before retrying.") }
            journal.phase = "exchanging"; try writeJournal(journal)
            try exchange(app, stage)
            let result: PatchReport
            do {
                result = try status(app)
                // An upgrade leaves the vendor original where it is; the stage
                // path now holds the replaced patch, removed once committed.
                if journal.replaces == nil { try fm.moveItem(at: stage, to: backup) }
            } catch {
                let original = fm.fileExists(atPath: stage.path) ? stage : backup
                do { try exchange(app, original) }
                catch { throw PatchError.invalid("Installation failed and could not be rolled back (\(error.localizedDescription)). Run patch recovery before reopening ChatGPT.") }
                try? fm.removeItem(at: original); try? fm.removeItem(at: journalURL)
                throw error
            }
            // The verified patch is installed. A journal that cannot advance
            // still recovers consistently: "exchanging" rolls back, "committed" keeps it.
            journal.phase = "committed"; try? writeJournal(journal)
            try fm.removeItem(at: journalURL)
            pruneLeftovers(app)
            return result
        }
    }
    public func install(_ app: URL) throws -> PatchReport {
        if try prepare(app) == nil { return try status(app) }
        return try commit(app)
    }
    public func prepare(_ app: URL) throws -> URL? {
        let pending: (URL, Bool)? = try withLock {
            guard fm.fileExists(atPath: journalURL.path) else { return nil }
            let journal = try validatedJournal(app)
            guard journal.phase == "prepared" || journal.phase == "verified",
                  try fileSHA256(archive(app)) == journal.replaces ?? journal.receipt.originalArchiveHash else { throw PatchError.invalid("Interrupted installation requires recovery before continuing.") }
            let stage = URL(fileURLWithPath: journal.stage)
            _ = try status(stage)
            return (stage, journal.phase == "prepared")
        }
        if let (stage, needsProbe) = pending {
            // probe revalidates the journal under the lock before advancing it.
            if needsProbe { try probe(stage) }
            return stage
        }
        if try status(app).state == "patched", try receipt(app)?.adapter == adapter.id { return nil }
        let stage = try stage(app)
        try probe(stage)
        return stage
    }
    public func recover(_ app: URL) throws {
        try withLock {
            guard fm.fileExists(atPath: journalURL.path) else { return }
            let journal = try validatedJournal(app)
            let stage = URL(fileURLWithPath: journal.stage), backup = URL(fileURLWithPath: journal.backup)
            let appHash = try fileSHA256(archive(app))
            if journal.phase == "committed" {
                _ = try status(app)
                guard try fileSHA256(archive(backup)) == journal.receipt.originalArchiveHash else { throw PatchError.invalid("The recovery backup failed verification.") }
                if fm.fileExists(atPath: stage.path) { try fm.removeItem(at: stage) }
            } else if appHash == journal.receipt.patchedArchiveHash {
                // Undo the exchange: an upgrade's stage holds the replaced patch.
                let original = fm.fileExists(atPath: stage.path) ? stage : backup
                guard try fileSHA256(archive(original)) == journal.replaces ?? journal.receipt.originalArchiveHash else { throw PatchError.invalid("The original recovery bundle failed verification.") }
                try command("/usr/bin/codesign", ["--verify", "--deep", "--strict", original.path])
                try exchange(app, original); try fm.removeItem(at: original)
            } else {
                // Before the exchange the target was never touched, so a vendor
                // update since then must not leave the transaction unrecoverable.
                let swapped: Bool
                switch journal.phase {
                case "prepared", "verified": swapped = false
                case "exchanging" where journal.replaces != nil: swapped = archiveHash(stage) == journal.replaces
                case "exchanging": swapped = archiveHash(stage) != journal.receipt.patchedArchiveHash
                case "restoring": swapped = archiveHash(backup) != journal.receipt.originalArchiveHash
                default: swapped = true
                }
                guard !swapped || appHash == journal.receipt.originalArchiveHash else { throw PatchError.invalid("App changed during recovery; refusing to replace it.") }
                if fm.fileExists(atPath: stage.path) { try fm.removeItem(at: stage) }
                // An interrupted restore leaves the patched copy at the backup path.
                if journal.phase == "restoring", archiveHash(backup) == journal.receipt.patchedArchiveHash { try fm.removeItem(at: backup) }
            }
            try fm.removeItem(at: journalURL)
            pruneLeftovers(app)
        }
    }
    public func restore(_ app: URL) throws -> PatchReport {
        try withLock {
            guard !fm.fileExists(atPath: journalURL.path), let receipt = try receipt(app) else { throw PatchError.invalid("Recover any pending transaction before restoring a patched app.") }
            _ = try status(app)
            let recordedBackup = URL(fileURLWithPath: receipt.backupPath)
            guard recordedBackup.lastPathComponent.hasPrefix(".ChatGPT.codexpp-original-"),
                  recordedBackup.standardizedFileURL == recordedBackup.resolvingSymlinksInPath(),
                  try fileSHA256(archive(recordedBackup)) == receipt.originalArchiveHash, try status(recordedBackup).state == "unpatched" else { throw PatchError.invalid("The original app backup failed verification.") }
            // A validated bundle can move during the real updater rehearsal.
            // Copy its authenticated original onto the installation filesystem;
            // the recovery journal still permits exchanges only in that parent.
            let backup: URL
            if recordedBackup.deletingLastPathComponent() == app.deletingLastPathComponent() { backup = recordedBackup }
            else {
                backup = app.deletingLastPathComponent().appendingPathComponent(".ChatGPT.codexpp-original-\(UUID().uuidString).app")
                try command("/usr/bin/ditto", [recordedBackup.path, backup.path], timeout: 120)
            }
            guard backup.deletingLastPathComponent() == app.deletingLastPathComponent(),
                  try fileSHA256(archive(backup)) == receipt.originalArchiveHash, try status(backup).state == "unpatched" else { throw PatchError.invalid("The original app backup failed verification.") }
            // The same transaction recovery path handles interrupted restoration.
            let journal = PatchJournal(schema: 1, target: app.path, stage: backup.path.replacingOccurrences(of: ".codexpp-original-", with: ".codexpp-stage-"), backup: backup.path, receipt: receipt, phase: "restoring")
            try writeJournal(journal)
            try exchange(app, backup)
            let result = try status(app)
            // The exchange moved the patched copy to the backup path. Delete it
            // only after the original has verified in place.
            guard archiveHash(backup) == receipt.patchedArchiveHash else { throw PatchError.invalid("The displaced patched app failed verification; run patch recovery.") }
            try fm.removeItem(at: backup)
            try fm.removeItem(at: journalURL)
            if recordedBackup != backup, archiveHash(recordedBackup) == receipt.originalArchiveHash { try? fm.removeItem(at: recordedBackup) }
            pruneLeftovers(app)
            return result
        }
    }
    public func probe(_ stage: URL) throws {
        try checkStartup(stage)
        try withLock {
            var journal = try validatedJournal()
            guard journal.stage == stage.path, journal.phase == "prepared" || journal.phase == "verified" else { throw PatchError.invalid("Probe does not match the pending patch.") }
            journal.phase = "verified"; try writeJournal(journal)
        }
    }
    /// Validate a signed patched bundle without committing a transaction or
    /// starting the vendor app. Also used for real-bundle probe regression checks.
    public func checkStartup(_ stage: URL) throws {
        onProgress("Checking startup…")
        guard try status(stage).state == "patched" else {
            throw PatchError.invalid("Startup checks require a verified patched bundle; the vendor app was not launched.")
        }
        let info = try plist(stage)
        guard let executable = info["CFBundleExecutable"] as? String, !executable.contains("/"), !executable.isEmpty else { throw PatchError.invalid("Invalid executable name.") }
        let proof = support.appendingPathComponent("Diagnostics/probe.json")
        try? fm.removeItem(at: proof)
        let profile = support.appendingPathComponent("Patching/probe-profile-\(UUID().uuidString)")
        defer { try? fm.removeItem(at: profile) }
        // A disposable profile still initializes Chromium's macOS OSCrypt
        // provider. Keep this test process off the user's real Keychain.
        try command(stage.appendingPathComponent("Contents/MacOS/\(executable)").path, ["--codexpp-probe", "--use-mock-keychain", "--user-data-dir=\(profile.path)"], timeout: 30)
        guard let data = try JSONSerialization.jsonObject(with: Data(contentsOf: proof)) as? [String: Any],
              data["adapter"] as? String == adapter.id, data["port"] as? Int == port,
              data["app"] as? String == archive(stage).path,
              (!adapter.isReviewed || data["keychainInteractionAllowed"] as? Bool == false) else { throw PatchError.invalid("The staged app failed its startup probe or noninteractive Keychain policy check.") }
    }
    @discardableResult private func command(_ executable: String, _ arguments: [String], timeout: TimeInterval = 60) throws -> Data {
        let process = Process(); process.executableURL = URL(fileURLWithPath: executable); process.arguments = arguments
        let completed = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in completed.signal() }
        let started = Date()
        defer {
            if ProcessInfo.processInfo.environment["CODEXPP_PATCH_TRACE"] == "1" {
                let line = String(format: "command %.3fs %@ %@\n", Date().timeIntervalSince(started), URL(fileURLWithPath: executable).lastPathComponent, arguments.joined(separator: " "))
                FileHandle.standardError.write(Data(line.utf8))
            }
        }
        let log = fm.temporaryDirectory.appendingPathComponent("codexpp-command-\(UUID().uuidString).log")
        guard fm.createFile(atPath: log.path, contents: nil) else { throw PatchError.invalid("Cannot create command log.") }
        let out = try FileHandle(forWritingTo: log)
        defer { try? out.close(); try? fm.removeItem(at: log) }
        process.standardOutput = out; process.standardError = out
        try process.run()
        if completed.wait(timeout: .now() + timeout) == .timedOut {
            process.terminate()
            if completed.wait(timeout: .now() + 0.2) == .timedOut { kill(process.processIdentifier, SIGKILL) }
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
