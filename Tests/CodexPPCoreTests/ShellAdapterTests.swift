import XCTest
@testable import CodexPPCore

final class ShellAdapterTests: XCTestCase {
    func testIncompleteShellIsRejected() {
        XCTAssertThrowsError(try ShellAdapter.patch(source: Data("throw Error('do not execute');".utf8)))
    }

    func testReviewedShellPreservesSettingsAdapterOutput() throws {
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
        if let settingsShell = patches.first(where: { $0.0 == shellPath }) {
            let original = String(decoding: try archive.data(at: shellPath), as: UTF8.self)
            let settingsText = String(decoding: settingsShell.1, as: UTF8.self)
            let additions = ["codexpp-extensions", "ppExtensionIcon", "__codexPPNativeSettings"]
                .filter { settingsText.contains($0) && !original.contains($0) }
            XCTAssertFalse(additions.isEmpty)
            for addition in additions { XCTAssertTrue(text.contains(addition)) }
        } else {
            XCTAssertTrue(patches.contains(where: { String(decoding: $0.1, as: UTF8.self).contains("/* fixture settings runtime */") }))
        }
    }
}
