import XCTest
@testable import CodexPPCore

final class AppToolsAdapterTests: XCTestCase {
    private let contract = "return{...a,command:process.platform===`win32`?a.command:C.default.join(n.path,a.command),cwd:e?`/`:n.path,enabled:!1,env:s}"
    private let previousContract = "return{...a,command:process.platform===`win32`?a.command:b.default.join(n.path,a.command),cwd:e?`/`:n.path,enabled:!1,env:c}"

    func testWrapsTheUniqueVendorLaunchConfiguration() throws {
        let result = try AppToolsAdapter.patch("before\(contract)after")
        XCTAssertTrue(result.contains("return globalThis.__codexPPWrapAppToolsConfig({"))
        XCTAssertFalse(result.contains(contract))
    }

    func testWrapsPreviousReviewedBuildContract() throws {
        let result = try AppToolsAdapter.patch(previousContract)
        XCTAssertEqual(result, "return globalThis.__codexPPWrapAppToolsConfig(" + previousContract.dropFirst("return".count) + ")")
    }

    func testRejectsMissingOrAmbiguousContract() {
        XCTAssertThrowsError(try AppToolsAdapter.patch("missing"))
        XCTAssertThrowsError(try AppToolsAdapter.patch(contract + contract))
    }
}
