import XCTest
@testable import CodexPPCore

final class BookmarksAdapterTests: XCTestCase {
    func testReviewedBookmarksPreserveStartupReplacement() throws {
        guard let path = ProcessInfo.processInfo.environment["CODEXPP_ORIGINAL_ASAR"] else {
            throw XCTSkip("Set CODEXPP_ORIGINAL_ASAR to check the approved bookmarks modules.")
        }
        let archive = try AsarArchive(URL(fileURLWithPath: path))
        let initialPath = try XCTUnwrap(archive.packedFiles(in: "webview/assets").first { $0.contains("app-initial-") && $0.hasSuffix(".js") })
        var startup = try archive.data(at: initialPath)
        startup.append(Data("\nglobalThis.__settingsFixture=true;".utf8))
        let bases = [(initialPath, startup)]
        let bookmarks = try BookmarksAdapter.discover(archive: archive, replacements: bases)
        XCTAssertEqual(bookmarks.count, 5)
        let initial = try XCTUnwrap(bookmarks.first { $0.0.contains("app-initial-") })
        let text = String(decoding: initial.1, as: UTF8.self)
        XCTAssertTrue(text.contains("__codexPPBookmarks"))
        XCTAssertTrue(text.contains("__settingsFixture"))
        XCTAssertTrue(bookmarks.contains { String(decoding: $0.1, as: UTF8.self).contains("__codexPPBookmarks.provide(") })
    }
}
