import XCTest
@testable import CodexPPCore

final class StartupPolicyAdapterTests: XCTestCase {
    func testChangesOnlyUniqueLauncherPathAndPreservesLayout() throws {
        let framework = "Contents/Frameworks/Codex Framework.framework/Versions/155.0.8059.27/Codex Framework"
        var binary = Data([0xcf,0xfa,0xed,0xfe,0x0c,0x00,0x00,0x01])
        binary.append(Data(repeating: 0, count: 64))
        let path = Data(("../" + framework.dropFirst("Contents/".count) + "\0").utf8)
        binary.append(path); binary.append(Data([1,2,3,4]))
        let patched = try StartupPolicyAdapter.patch(binary, frameworkPath: framework)
        XCTAssertEqual(binary.count, patched.count)
        XCTAssertEqual(binary.prefix(72), patched.prefix(72))
        XCTAssertEqual(binary.suffix(4), patched.suffix(4))
        XCTAssertNotNil(patched.range(of: Data((StartupPolicyAdapter.replacement + "\0").utf8)))
        XCTAssertThrowsError(try StartupPolicyAdapter.patch(patched, frameworkPath: framework))
        binary.append(path)
        XCTAssertThrowsError(try StartupPolicyAdapter.patch(binary, frameworkPath: framework))
    }
}
