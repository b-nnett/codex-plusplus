import XCTest
@testable import CodexPPCore

final class ReviewedPatchRecipeTests: XCTestCase {
    func testRecipeUsesByteOffsetsAndPreservesUnicodeAndUntouchedBytes() throws {
        let source = Data("αβ-original-γδ".utf8)
        let expected = Data("αβ-updated-γδ".utf8)
        let recipe = ReviewedPatchRecipe.Replacement(path: "main.js", sourceHash: sha256(source), patchedHash: sha256(expected), edits: [.init(start: 5, end: 13, data: Data("updated".utf8))])
        XCTAssertEqual(try recipe.apply(to: source), expected)
    }
    func testChangedSourceAndOutputHashesFailClosed() throws {
        let source = Data("original".utf8)
        let recipe = ReviewedPatchRecipe.Replacement(path: "main.js", sourceHash: sha256(source), patchedHash: sha256(Data("wrong".utf8)), edits: [.init(start: 0, end: source.count, data: Data("updated".utf8))])
        XCTAssertThrowsError(try recipe.apply(to: source))
        XCTAssertThrowsError(try recipe.apply(to: Data("changed".utf8)))
    }
    func testOverlappingNegativeAndOutOfBoundsEditsFailClosed() throws {
        let source = Data("original".utf8)
        let cases: [[ReviewedPatchRecipe.Edit]] = [[.init(start: -1, end: 1, data: Data())], [.init(start: 0, end: 99, data: Data())], [.init(start: 0, end: 4, data: Data()), .init(start: 3, end: 5, data: Data())]]
        for edits in cases {
            let recipe = ReviewedPatchRecipe.Replacement(path: "main.js", sourceHash: sha256(source), patchedHash: sha256(source), edits: edits)
            XCTAssertThrowsError(try recipe.apply(to: source))
        }
    }
}
