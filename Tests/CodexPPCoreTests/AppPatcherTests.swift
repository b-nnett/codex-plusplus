import XCTest
import Darwin
@testable import CodexPPCore

final class AppPatcherTests: XCTestCase {
    func testStagingCapacityIncludesBundleArchiveAndSafetyMargin() {
        XCTAssertEqual(AppPatcher.requiredStagingCapacity(bundleAllocatedSize: 2_000, archiveSize: 500), 1_073_744_324)
        XCTAssertEqual(AppPatcher.requiredStagingCapacity(bundleAllocatedSize: -1, archiveSize: -1), 1_073_741_824)
    }
    private func sign(_ path: URL) throws {
        let process = Process(); process.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
        process.arguments = ["--force", "--sign", "-", path.path]
        process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
        try process.run(); process.waitUntilExit(); XCTAssertEqual(process.terminationStatus, 0)
    }
    private func fixture() throws -> (URL, URL, AppPatcher) {
        let (asar, _, adapter) = try AsarPatchTests.fixture()
        let root = asar.deletingLastPathComponent(), app = root.appendingPathComponent("ChatGPT.app"), helper = root.appendingPathComponent("Helper.app")
        for (bundle, id) in [(app, DesktopAppLocator.bundleIdentifier), (helper, "dev.codexpp.helper")] {
            try FileManager.default.createDirectory(at: bundle.appendingPathComponent("Contents/MacOS"), withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: bundle.appendingPathComponent("Contents/Resources"), withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: URL(fileURLWithPath: "/usr/bin/true"), to: bundle.appendingPathComponent("Contents/MacOS/Test"))
            let info: [String: Any] = ["CFBundleIdentifier": id, "CFBundleExecutable": "Test", "CFBundlePackageType": "APPL", "CFBundleName": "Test", "CFBundleShortVersionString": "1", "CFBundleVersion": "1", "ElectronAsarIntegrity": ["Resources/app.asar": ["algorithm": "SHA256", "hash": adapter.headerHash]]]
            try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0).write(to: bundle.appendingPathComponent("Contents/Info.plist"))
        }
        try FileManager.default.copyItem(at: asar, to: app.appendingPathComponent("Contents/Resources/app.asar"))
        try sign(app); try sign(helper)
        var patcher = AppPatcher(support: root.appendingPathComponent("Support"), helper: helper, adapter: adapter)
        patcher.trashesOriginals = false
        return (root, app, patcher)
    }
    // Simulates a successful startup probe for the tiny non-Electron fixture.
    // The real Electron startup probe is run separately against the staged app.
    private func setPhase(_ phase: String, _ root: URL) throws {
        let file = root.appendingPathComponent("Support/Patching/transaction.json")
        var json = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as! [String: Any]
        json["phase"] = phase
        try JSONSerialization.data(withJSONObject: json).write(to: file)
    }
    func testStageLeavesOriginalUntouchedAndCommitRequiresProbe() throws {
        let (root, app, patcher) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let hash = try fileSHA256(app.appendingPathComponent("Contents/Resources/app.asar"))
        let stage = try patcher.stage(app)
        XCTAssertEqual(try patcher.status(stage).state, "patched")
        XCTAssertEqual(try fileSHA256(app.appendingPathComponent("Contents/Resources/app.asar")), hash)
        XCTAssertThrowsError(try patcher.commit(app))
        try patcher.recover(app)
        XCTAssertFalse(FileManager.default.fileExists(atPath: stage.path))
        XCTAssertEqual(try patcher.status(app).state, "unpatched")
    }
    func testAtomicCommitIsIdempotentAndOriginalSignatureRestores() throws {
        let (root, app, patcher) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let original = try Data(contentsOf: app.appendingPathComponent("Contents/Info.plist"))
        _ = try patcher.stage(app); try setPhase("verified", root)
        let report = try patcher.commit(app)
        XCTAssertEqual(report.state, "patched")
        XCTAssertEqual(try patcher.install(app).state, "patched")
        XCTAssertEqual(try patcher.restore(app).state, "unpatched")
        XCTAssertEqual(try Data(contentsOf: app.appendingPathComponent("Contents/Info.plist")), original)
    }
    func testInterruptedExchangeRecoversOriginal() throws {
        let (root, app, patcher) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let stage = try patcher.stage(app); try setPhase("exchanging", root)
        XCTAssertEqual(renameatx_np(AT_FDCWD, app.path, AT_FDCWD, stage.path, UInt32(RENAME_SWAP)), 0)
        XCTAssertEqual(try patcher.status(app).state, "patched")
        try patcher.recover(app)
        XCTAssertEqual(try patcher.status(app).state, "unpatched")
        XCTAssertFalse(FileManager.default.fileExists(atPath: stage.path))
    }
    func testModifiedStageIsNeverCommitted() throws {
        let (root, app, patcher) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let stage = try patcher.stage(app); try setPhase("verified", root)
        let path = stage.appendingPathComponent("Contents/Resources/app.asar")
        var bytes = try Data(contentsOf: path); bytes[bytes.count - 1] ^= 1; try bytes.write(to: path)
        XCTAssertThrowsError(try patcher.commit(app))
        XCTAssertEqual(try patcher.status(app).state, "unpatched")
        try patcher.recover(app)
    }
    func testRestoreRejectsCorruptedOriginalBackup() throws {
        let (root, app, patcher) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        _ = try patcher.stage(app); try setPhase("verified", root)
        let report = try patcher.commit(app)
        let backup = URL(fileURLWithPath: try XCTUnwrap(report.backupPath))
        try Data("broken".utf8).write(to: backup.appendingPathComponent("Contents/Resources/app.asar"))
        XCTAssertThrowsError(try patcher.restore(app))
        XCTAssertEqual(try patcher.status(app).state, "patched")
    }
    private func hiddenBundles(_ root: URL) throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: root.path).filter { $0.hasPrefix(".ChatGPT.codexpp-") }
    }
    func testRestoreRemovesDisplacedPatchedCopy() throws {
        let (root, app, patcher) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        _ = try patcher.stage(app); try setPhase("verified", root)
        _ = try patcher.commit(app)
        XCTAssertEqual(try hiddenBundles(root).count, 1)
        XCTAssertEqual(try patcher.restore(app).state, "unpatched")
        XCTAssertEqual(try hiddenBundles(root), [])
    }
    func testInterruptedRestoreRecoversWithoutLeakingPatchedCopy() throws {
        let (root, app, patcher) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        _ = try patcher.stage(app); try setPhase("verified", root)
        let backup = URL(fileURLWithPath: try XCTUnwrap(try patcher.commit(app).backupPath))
        let receipt = try JSONSerialization.jsonObject(with: Data(contentsOf: app.appendingPathComponent("Contents/Resources/codexpp-patch.json")))
        let journal: [String: Any] = ["schema": 1, "target": app.path, "stage": backup.path.replacingOccurrences(of: ".codexpp-original-", with: ".codexpp-stage-"), "backup": backup.path, "receipt": receipt, "phase": "restoring"]
        try JSONSerialization.data(withJSONObject: journal).write(to: root.appendingPathComponent("Support/Patching/transaction.json"))
        XCTAssertEqual(renameatx_np(AT_FDCWD, app.path, AT_FDCWD, backup.path, UInt32(RENAME_SWAP)), 0)
        try patcher.recover(app)
        XCTAssertEqual(try patcher.status(app).state, "unpatched")
        XCTAssertEqual(try hiddenBundles(root), [])
    }
    func testPendingStageRecoversAfterVendorUpdate() throws {
        for phase in ["prepared", "verified", "exchanging"] {
            let (root, app, patcher) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
            let stage = try patcher.stage(app); try setPhase(phase, root)
            let archive = app.appendingPathComponent("Contents/Resources/app.asar")
            let updated = try Data(contentsOf: archive) + Data("update".utf8)
            try updated.write(to: archive)
            XCTAssertNoThrow(try patcher.recover(app), phase)
            XCTAssertFalse(FileManager.default.fileExists(atPath: stage.path), phase)
            XCTAssertEqual(try Data(contentsOf: archive), updated, phase)
            XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("Support/Patching/transaction.json").path), phase)
        }
    }
    func testSwappedTransactionStillRefusesChangedApp() throws {
        let (root, app, patcher) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let stage = try patcher.stage(app); try setPhase("exchanging", root)
        XCTAssertEqual(renameatx_np(AT_FDCWD, app.path, AT_FDCWD, stage.path, UInt32(RENAME_SWAP)), 0)
        let archive = app.appendingPathComponent("Contents/Resources/app.asar")
        try (Data(contentsOf: archive) + Data("update".utf8)).write(to: archive)
        XCTAssertThrowsError(try patcher.recover(app))
        XCTAssertTrue(FileManager.default.fileExists(atPath: stage.path))
    }
    func testReceiptRevisionsAreScopedToBuild() {
        let current = PatchAdapter.current
        XCTAssertEqual(current.id, "chatgpt-macos-20052-v\(PatchAdapter.revision)")
        XCTAssertTrue(current.accepts(receiptAdapter: "chatgpt-macos-20052-v1"))
        XCTAssertTrue(current.accepts(receiptAdapter: current.id))
        XCTAssertFalse(current.accepts(receiptAdapter: "chatgpt-macos-20052-v\(PatchAdapter.revision + 1)"))
        XCTAssertFalse(current.accepts(receiptAdapter: "chatgpt-macos-13536-v30"))
        XCTAssertFalse(current.accepts(receiptAdapter: "chatgpt-macos-20052-v0"))
        XCTAssertFalse(current.accepts(receiptAdapter: "xchatgpt-macos-20052-v3"))
        let dynamic = PatchAdapter(id: PatchAdapter.id(build: "777"), version: "9", build: "777", main: "m", mainHash: "", headerHash: "", vendorAuthenticated: true)
        XCTAssertTrue(dynamic.accepts(receiptAdapter: "chatgpt-macos-777-v31"))
        let fixture = PatchAdapter(id: "fixture", version: "1", build: "1", main: "m", mainHash: "", headerHash: "")
        XCTAssertTrue(fixture.accepts(receiptAdapter: "fixture"))
        XCTAssertFalse(fixture.accepts(receiptAdapter: "chatgpt-macos-2-v1"))
    }
    private func revision(_ patcher: AppPatcher, _ n: Int) -> AppPatcher {
        let a = patcher.adapter
        return AppPatcher(support: patcher.support, helper: patcher.helper, adapter: PatchAdapter(id: "chatgpt-macos-\(a.build)-v\(n)", version: a.version, build: a.build, main: a.main, mainHash: a.mainHash, headerHash: a.headerHash))
    }
    private func installedAdapter(_ app: URL) throws -> String {
        try JSONDecoder().decode(PatchReceipt.self, from: Data(contentsOf: app.appendingPathComponent("Contents/Resources/codexpp-patch.json"))).adapter
    }
    private func installRevision(_ patcher: AppPatcher, _ app: URL, _ root: URL) throws -> PatchReport {
        _ = try patcher.stage(app); try setPhase("verified", root)
        return try patcher.commit(app)
    }
    func testUpgradeStagesWhileOldPatchStaysInstalled() throws {
        let (root, app, base) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let original = try Data(contentsOf: app.appendingPathComponent("Contents/Info.plist"))
        let v1 = revision(base, 1), v2 = revision(base, 2)
        let backup = try XCTUnwrap(try installRevision(v1, app, root).backupPath)
        let stage = try v2.stage(app)
        XCTAssertEqual(try installedAdapter(app), v1.adapter.id)
        XCTAssertEqual(try installedAdapter(stage), v2.adapter.id)
        try setPhase("verified", root)
        let report = try v2.commit(app)
        XCTAssertEqual(report.state, "patched")
        XCTAssertEqual(report.backupPath, backup)
        XCTAssertEqual(try installedAdapter(app), v2.adapter.id)
        XCTAssertEqual(try hiddenBundles(root), [URL(fileURLWithPath: backup).lastPathComponent])
        XCTAssertEqual(try v2.restore(app).state, "unpatched")
        XCTAssertEqual(try Data(contentsOf: app.appendingPathComponent("Contents/Info.plist")), original)
        XCTAssertEqual(try hiddenBundles(root), [])
    }
    func testFailedUpgradeKeepsOldPatch() throws {
        let (root, app, base) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let v1 = revision(base, 1), v2 = revision(base, 2)
        let backup = try XCTUnwrap(try installRevision(v1, app, root).backupPath)
        let stage = try v2.stage(app); try setPhase("verified", root)
        let path = stage.appendingPathComponent("Contents/Resources/app.asar")
        var bytes = try Data(contentsOf: path); bytes[bytes.count - 1] ^= 1; try bytes.write(to: path)
        XCTAssertThrowsError(try v2.commit(app))
        XCTAssertEqual(try installedAdapter(app), v1.adapter.id)
        try v2.recover(app)
        XCTAssertEqual(try v2.status(app).state, "patched")
        XCTAssertEqual(try hiddenBundles(root), [URL(fileURLWithPath: backup).lastPathComponent])
    }
    func testInterruptedUpgradeExchangeRollsBackToOldPatch() throws {
        let (root, app, base) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let v1 = revision(base, 1), v2 = revision(base, 2)
        let backup = try XCTUnwrap(try installRevision(v1, app, root).backupPath)
        let stage = try v2.stage(app); try setPhase("exchanging", root)
        XCTAssertEqual(renameatx_np(AT_FDCWD, app.path, AT_FDCWD, stage.path, UInt32(RENAME_SWAP)), 0)
        XCTAssertEqual(try installedAdapter(app), v2.adapter.id)
        try v2.recover(app)
        XCTAssertEqual(try installedAdapter(app), v1.adapter.id)
        XCTAssertEqual(try v2.status(app).state, "patched")
        XCTAssertEqual(try hiddenBundles(root), [URL(fileURLWithPath: backup).lastPathComponent])
    }
    func testUnswappedUpgradeExchangeDiscardsStage() throws {
        let (root, app, base) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let v1 = revision(base, 1), v2 = revision(base, 2)
        _ = try installRevision(v1, app, root)
        let stage = try v2.stage(app); try setPhase("exchanging", root)
        try v2.recover(app)
        XCTAssertFalse(FileManager.default.fileExists(atPath: stage.path))
        XCTAssertEqual(try installedAdapter(app), v1.adapter.id)
    }
    func testStagingPrunesOnlyUnownedChatGPTLeftovers() throws {
        let (root, app, patcher) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let fm = FileManager.default
        for name in [".ChatGPT.codexpp-original-OLD.app", ".ChatGPT.codexpp-stage-DEAD.app"] {
            try fm.copyItem(at: app, to: root.appendingPathComponent(name))
        }
        let foreign = root.appendingPathComponent(".ChatGPT.codexpp-original-FOREIGN.app")
        try fm.copyItem(at: root.appendingPathComponent("Helper.app"), to: foreign)
        let other = root.appendingPathComponent(".ChatGPT.codexpp-other.app")
        try fm.copyItem(at: app, to: other)
        let backup = try XCTUnwrap(try installRevision(patcher, app, root).backupPath)
        // A patched sibling outside the transaction names keeps its backup.
        let kept = root.appendingPathComponent(".ChatGPT.codexpp-original-KEPT.app")
        try fm.copyItem(at: URL(fileURLWithPath: backup), to: kept)
        try fm.removeItem(at: other); try fm.copyItem(at: app, to: other)
        let receiptURL = other.appendingPathComponent("Contents/Resources/codexpp-patch.json")
        var receipt = try JSONSerialization.jsonObject(with: Data(contentsOf: receiptURL)) as! [String: Any]
        receipt["backupPath"] = kept.path
        try JSONSerialization.data(withJSONObject: receipt).write(to: receiptURL)
        XCTAssertEqual(try patcher.restore(app).state, "unpatched")
        XCTAssertEqual(Set(try hiddenBundles(root)), [foreign.lastPathComponent, other.lastPathComponent, kept.lastPathComponent])
    }
    func testPrepareDiscardsAStaleTransactionAfterAVendorUpdate() throws {
        let (root, app, patcher) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let stale = try patcher.stage(app); try setPhase("verified", root)
        let archive = app.appendingPathComponent("Contents/Resources/app.asar")
        try (Data(contentsOf: archive) + Data("update".utf8)).write(to: archive)
        // The fixture's adapter rejects the changed archive, but only after the
        // stale transaction was cleared rather than blocking every later patch.
        XCTAssertThrowsError(try patcher.prepare(app)) { error in
            XCTAssertFalse("\(error)".contains("requires recovery"), "\(error)")
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: stale.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("Support/Patching/transaction.json").path))
    }
    func testRunningProcessesInsideABundleAreFound() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let bundle = root.appendingPathComponent("Running.app"), executable = bundle.appendingPathComponent("Contents/MacOS/sleep")
        try FileManager.default.createDirectory(at: executable.deletingLastPathComponent(), withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.copyItem(at: URL(fileURLWithPath: "/bin/sleep"), to: executable)
        XCTAssertTrue(AppPatcher.processes(inside: bundle).isEmpty)
        let process = Process(); process.executableURL = executable; process.arguments = ["30"]
        try process.run(); defer { process.terminate() }
        XCTAssertEqual(AppPatcher.processes(inside: bundle), [process.processIdentifier])
        XCTAssertTrue(AppPatcher.processes(inside: root.appendingPathComponent("Run")).isEmpty, "prefix match is per directory")
    }
    func testPruningKeepsEverythingWhenAReceiptIsUnreadable() throws {
        let (root, app, patcher) = try fixture(); defer { try? FileManager.default.removeItem(at: root) }
        let fm = FileManager.default
        let leftover = root.appendingPathComponent(".ChatGPT.codexpp-original-OLD.app")
        try fm.copyItem(at: app, to: leftover)
        let future = root.appendingPathComponent("ChatGPT Beta.app")
        try fm.copyItem(at: app, to: future)
        try Data("{\"schema\": 99}".utf8).write(to: future.appendingPathComponent("Contents/Resources/codexpp-patch.json"))
        _ = try patcher.stage(app); try patcher.recover(app)
        XCTAssertTrue(fm.fileExists(atPath: leftover.path), "an unreadable receipt might own this backup")
    }
}
