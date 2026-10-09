import XCTest
import Darwin
@testable import CodexPPCore

final class AppPatcherTests: XCTestCase {
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
        return (root, app, AppPatcher(support: root.appendingPathComponent("Support"), helper: helper, adapter: adapter))
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
}
