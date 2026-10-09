import XCTest
@testable import CodexPPCore

final class PatchSigningPolicyTests: XCTestCase {
    func testRestrictedVendorEntitlementsAreNeverClaimedByLocalSignature() throws {
        let original: [String: Any] = ["com.apple.application-identifier": "vendor.app", "com.apple.developer.team-identifier": "vendor", "keychain-access-groups": ["vendor.*"], "com.apple.security.application-groups": ["vendor.group"], "com.apple.developer.aps-environment": "production", "com.apple.security.cs.allow-jit": true, "com.apple.security.device.camera": true]
        let result = try PatchSigningPolicy.localEntitlements(original)
        XCTAssertEqual(Set(result.keys), ["com.apple.security.cs.allow-jit", "com.apple.security.device.camera", "com.apple.security.cs.disable-library-validation"])
        XCTAssertEqual(result["com.apple.security.cs.allow-jit"] as? Bool, true)
        XCTAssertThrowsError(try PatchSigningPolicy.localEntitlements(["com.apple.security.app-sandbox": true]))
    }
}
