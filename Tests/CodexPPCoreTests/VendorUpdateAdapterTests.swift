import XCTest
@testable import CodexPPCore

final class VendorUpdateAdapterTests: XCTestCase {
    func testAuthenticatedDiscoveryMatchesPinnedReleaseWithoutUsingItsAdapter() throws {
        guard let archivePath = ProcessInfo.processInfo.environment["CODEXPP_ORIGINAL_ASAR"] else { throw XCTSkip("Set CODEXPP_ORIGINAL_ASAR to a vendor-signed app archive.") }
        let app = URL(fileURLWithPath: archivePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let info = try PropertyListSerialization.propertyList(from: Data(contentsOf: app.appendingPathComponent("Contents/Info.plist")), format: nil) as! [String: Any]
        let discovered = try VendorUpdateAdapter.discover(app, info: info)
        guard let pinned = PatchAdapter.reviewed.first(where: { $0.build == discovered.build }) else {
            throw XCTSkip("Build \(discovered.build) is not a pinned reviewed release; nothing to compare.")
        }
        XCTAssertEqual(discovered.headerHash, pinned.headerHash)
        XCTAssertEqual(discovered.mainHash, pinned.mainHash)
        XCTAssertEqual(discovered.frameworkHash, pinned.frameworkHash)
        XCTAssertEqual(discovered.integrityOffset, pinned.integrityOffset)
        XCTAssertTrue(discovered.vendorAuthenticated == true)
        XCTAssertTrue(discovered.isReviewed)
    }
    func testNonVendorCodeCannotApproveFutureAdapters() throws {
        XCTAssertThrowsError(try VendorUpdateAdapter.authenticate(URL(fileURLWithPath: "/usr/bin/true")))
    }
}
