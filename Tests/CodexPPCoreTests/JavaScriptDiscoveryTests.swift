import XCTest
@testable import CodexPPCore

final class JavaScriptDiscoveryTests: XCTestCase {
    func testMissingBundledRuntimeRetainsParserFallback() throws {
        let (path, _, _) = try AsarPatchTests.fixture()
        defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        XCTAssertNil(try JavaScriptDiscovery.run(archive: AsarArchive(path), adapter: "browser", input: [:]))
    }
    func testUnsignedRuntimeIsRejectedBeforeExecution() throws {
        let (path, _, _) = try AsarPatchTests.fixture()
        defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        let runtime = path.deletingLastPathComponent().appendingPathComponent("cua_node/bin/node")
        try FileManager.default.createDirectory(at: runtime.deletingLastPathComponent(), withIntermediateDirectories: true)
        let marker = path.deletingLastPathComponent().appendingPathComponent("executed")
        try Data("#!/bin/sh\ntouch '\(marker.path)'\n".utf8).write(to: runtime)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: runtime.path)
        XCTAssertThrowsError(try JavaScriptDiscovery.run(archive: AsarArchive(path), adapter: "browser", input: [:]))
        XCTAssertFalse(FileManager.default.fileExists(atPath: marker.path))
    }
    func testRuntimeSymlinkOutsideResourcesIsRejected() throws {
        let (path, _, _) = try AsarPatchTests.fixture()
        defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        let runtime = path.deletingLastPathComponent().appendingPathComponent("cua_node/bin/node")
        try FileManager.default.createDirectory(at: runtime.deletingLastPathComponent(), withIntermediateDirectories: true)
        try FileManager.default.createSymbolicLink(atPath: runtime.path, withDestinationPath: "/bin/sh")
        XCTAssertThrowsError(try JavaScriptDiscovery.run(archive: AsarArchive(path), adapter: "browser", input: [:]))
    }
}
