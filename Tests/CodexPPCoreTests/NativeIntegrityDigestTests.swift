import XCTest
@testable import CodexPPCore

final class NativeIntegrityDigestTests: XCTestCase {
    func testOnlyTheReviewedDigestBytesChangeAndChecksStayEnabled() throws {
        let before = try NativeIntegrityDigest.dictionaryHash(["Resources/app.asar": ["algorithm": "SHA256", "hash": String(repeating: "a", count: 64)]])
        let after = try NativeIntegrityDigest.dictionaryHash(["Resources/app.asar": ["algorithm": "SHA256", "hash": String(repeating: "b", count: 64)]])
        var bytes = Data(repeating: 7, count: 10)
        bytes.append(Data("AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A".utf8)); bytes.append(contentsOf: [1,1]); bytes.append(before); bytes.append(Data(repeating: 9, count: 10))
        let result = try NativeIntegrityDigest.replacing(bytes, offset: 10, expected: before, replacement: after)
        XCTAssertEqual(result.prefix(44), bytes.prefix(44))
        XCTAssertEqual(result.suffix(10), bytes.suffix(10))
        XCTAssertEqual(result.subdata(in: 44..<76), after)
        XCTAssertThrowsError(try NativeIntegrityDigest.replacing(bytes, offset: 11, expected: before, replacement: after))
        XCTAssertThrowsError(try NativeIntegrityDigest.replacing(bytes, offset: 10, expected: after, replacement: before))
        bytes[42] = 0
        XCTAssertThrowsError(try NativeIntegrityDigest.replacing(bytes, offset: 10, expected: before, replacement: after))
    }
}
