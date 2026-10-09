import XCTest
@testable import CodexPPCore

final class ShellAdapterTests: XCTestCase {
    func testIncompleteShellIsRejected() {
        XCTAssertThrowsError(try ShellAdapter.patch(source: Data("throw Error('do not execute');".utf8)))
    }

    func testReviewedShellComposesWithSettingsAdapter() throws {
        guard let path = ProcessInfo.processInfo.environment["CODEXPP_ORIGINAL_ASAR"] else {
            throw XCTSkip("Set CODEXPP_ORIGINAL_ASAR to check the approved shell module.")
        }
        let archive = try AsarArchive(URL(fileURLWithPath: path))
        let patches = try NativeSettingsAdapter.patches(archive: archive, runtime: "/* fixture settings runtime */")
        let (shellPath, source) = try ShellAdapter.discover(archive: archive, replacements: patches)
        let text = String(decoding: source, as: UTF8.self)
        XCTAssertTrue(shellPath.hasPrefix("webview/assets/"))
        XCTAssertTrue(text.contains("data-codexpp-shell-sidebar-open"))
        XCTAssertTrue(text.contains("globalThis.__codexPPShell.registerSidebarToggle("))
        XCTAssertTrue(text.contains("/* fixture settings runtime */"))
    }
}
