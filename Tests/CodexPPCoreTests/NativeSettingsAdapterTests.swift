import XCTest
@testable import CodexPPCore

final class NativeSettingsAdapterTests: XCTestCase {
    func testReviewedSettingsModules() throws {
        guard let path = ProcessInfo.processInfo.environment["CODEXPP_ORIGINAL_ASAR"] else {
            throw XCTSkip("Set CODEXPP_ORIGINAL_ASAR to the reviewed original app archive for the vendor adapter check.")
        }
        let archive = try AsarArchive(URL(fileURLWithPath: path))
        let result = try NativeSettingsAdapter.discover(archive: archive, runtime: "/* fixture runtime */")
        XCTAssertEqual(result.patches.count, 3)
        XCTAssertEqual(Set(result.report.components.keys), ["Page","Title","Section","Card","Row","Toggle","Button"])
        let page = String(decoding: result.patches[0].1, as: UTF8.self)
        XCTAssertTrue(page.contains("Page:ppNativePage,Title:ppNativeTitle,Section:ppNativeSection,Card:ppNativeCard,Row:ppNativeRow,Toggle:ppNativeToggle,Button:ppNativeButton"))
        XCTAssertFalse(page.contains("Ge=Ge.filter(section=>section.slug!==`codexpp-extensions`)"))
        XCTAssertTrue(result.report.page.path.hasPrefix("webview/assets/"))
        if let output = ProcessInfo.processInfo.environment["CODEXPP_ADAPTER_OUTPUT"] {
            let directory = URL(fileURLWithPath: output)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            for (path, bytes) in result.patches { try bytes.write(to: directory.appendingPathComponent(URL(fileURLWithPath: path).lastPathComponent)) }
            try JSONEncoder().encode(result.report).write(to: directory.appendingPathComponent("discovery.json"))
        }
    }
    func testUnapprovedArchiveCannotUseDynamicDiscoveryToOverrideApproval() throws {
        let (path, _, _) = try AsarPatchTests.fixture()
        defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        XCTAssertThrowsError(try NativeSettingsAdapter.discover(archive: AsarArchive(path), runtime: ""))
    }
}
