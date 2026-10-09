import XCTest
@testable import CodexPPCore

final class DesktopAppLocatorTests: XCTestCase {
    private var root: URL!
    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at: root) }
    private func app(_ name: String, id: String = "com.openai.codex") throws -> URL {
        let app = root.appendingPathComponent(name + ".app")
        let contents = app.appendingPathComponent("Contents")
        try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
        let data = try PropertyListSerialization.data(fromPropertyList: ["CFBundleIdentifier": id, "CFBundleName": name, "CFBundlePackageType": "APPL"], format: .xml, options: 0)
        try data.write(to: contents.appendingPathComponent("Info.plist"))
        return app
    }
    func testDefaultsToChatGPTPath() {
        XCTAssertEqual(HelperSettings().appPath, "/Applications/ChatGPT.app")
    }
    func testMigratesMissingLegacyPathToRenamedDesktopApp() throws {
        let current = try app("ChatGPT")
        let old = root.appendingPathComponent("Codex.app")
        XCTAssertEqual(DesktopAppLocator.resolve(configuredPath: old.path, candidates: [current]), current.path)
    }
    func testKeepsExplicitSupportedLocationAndRejectsUnrelatedApp() throws {
        let selected = try app("My Desktop")
        let current = try app("ChatGPT")
        let unrelated = try app("Unrelated", id: "example.other")
        XCTAssertEqual(DesktopAppLocator.resolve(configuredPath: selected.path, candidates: [current]), selected.path)
        XCTAssertNil(DesktopAppLocator.resolve(configuredPath: unrelated.path, candidates: [unrelated]))
    }
}
