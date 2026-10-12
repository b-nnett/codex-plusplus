import XCTest
@testable import CodexPPCore

final class SidebarAdapterTests: XCTestCase {
    /// The JavaScriptCore fallback must agree with the Node adapter.
    func testInProcessDiscoveryResolvesTheSharedFixture() throws {
        let fixture = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("fixtures/sidebar-adapter/app-shared.js")
        let output = try SidebarAdapter.adaptInProcess(source: String(contentsOf: fixture, encoding: .utf8))
        XCTAssertEqual(output.missing, [])
        XCTAssertEqual(output.report["tooltip"]?.local, "q1")
        XCTAssertEqual(output.report["sectionMutator"]?.local, "r3")
        XCTAssertEqual(output.report["reactDOM"]?.local, "d1")
        XCTAssertTrue(output.source.contains("sidebarLayoutGate:\"3085093835\""))
        XCTAssertThrowsError(try SidebarAdapter.adaptInProcess(source: output.source))
    }

    func testInProcessDiscoveryReportsAnUnrelatedModuleAsMissing() throws {
        let output = try SidebarAdapter.adaptInProcess(source: "var AS=mk(`AppScope`);export{AS as A};")
        XCTAssertTrue(output.missing.contains("react (0 matches)"))
        XCTAssertTrue(output.missing.contains("appScope"))
        XCTAssertTrue(output.report.isEmpty)
    }
}
