import XCTest
@testable import CodexPPCore

final class NativeBrowserAdapterTests: XCTestCase {
    func testUnapprovedArchiveFailsClosed() throws {
        let (path, _, _) = try AsarPatchTests.fixture()
        defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        XCTAssertThrowsError(try NativeBrowserAdapter.patch(archive: AsarArchive(path)))
    }
    func testReviewedBrowserModule() throws {
        guard let path = ProcessInfo.processInfo.environment["CODEXPP_ORIGINAL_ASAR"] else {
            throw XCTSkip("Set CODEXPP_ORIGINAL_ASAR to check the approved native browser module.")
        }
        let (module, source) = try NativeBrowserAdapter.patch(archive: AsarArchive(URL(fileURLWithPath: path)))
        XCTAssertTrue(module.hasPrefix(".vite/build/main"))
        XCTAssertTrue(String(decoding: source, as: UTF8.self).contains("frame:globalThis.__codexPPNativeBrowser?.frameForContextMenu("))
    }
}
