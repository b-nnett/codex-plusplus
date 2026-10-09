import XCTest
@testable import CodexPPCore

final class ExtensionStoreTests: XCTestCase {
    private var folder: URL!
    override func setUpWithError() throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at: folder) }
    private func source(id: String = "test.example", entry: String = "index.js", scope: String = "renderer", code: String = "api.addStyle('body {}');") throws -> URL {
        let source = folder.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: source, withIntermediateDirectories: true)
        let manifest: [String: String] = ["id": id, "name": "Test extension", "version": "0.1.0", "scope": scope, "main": entry]
        try JSONSerialization.data(withJSONObject: manifest).write(to: source.appendingPathComponent("manifest.json"))
        try Data(code.utf8).write(to: source.appendingPathComponent("index.js"))
        return source
    }
    func testInstallAndReplaceKeepsOtherExtensions() throws {
        let store = ExtensionStore(root: folder.appendingPathComponent("store"))
        _ = try store.install(from: source())
        _ = try store.install(from: source(id: "other"))
        _ = try store.install(from: source(code: "return () => {};"))
        let listing = try store.list()
        XCTAssertEqual(listing.extensions.count, 2)
        XCTAssertEqual(listing.extensions.first(where: { $0.id == "test.example" })?.code, "return () => {};")
        XCTAssertTrue(listing.problems.isEmpty)
    }
    func testRejectedUpdateLeavesWorkingExtension() throws {
        let store = ExtensionStore(root: folder.appendingPathComponent("store"))
        _ = try store.install(from: source())
        XCTAssertThrowsError(try store.install(from: source(scope: "main")))
        XCTAssertEqual(try store.list().extensions.first?.code, "api.addStyle('body {}');")
    }
    func testTraversalAndSymlinkEntryRejected() throws {
        let store = ExtensionStore(root: folder)
        XCTAssertThrowsError(try store.load(source(id: "../escape")))
        XCTAssertThrowsError(try store.load(source(entry: "../outside.js")))
        let source = try source()
        try FileManager.default.removeItem(at: source.appendingPathComponent("index.js"))
        let outside = folder.appendingPathComponent("outside.js")
        try Data("secret".utf8).write(to: outside)
        try FileManager.default.createSymbolicLink(at: source.appendingPathComponent("index.js"), withDestinationURL: outside)
        XCTAssertThrowsError(try store.load(source))
    }
    func testMalformedSettingsArePreserved() throws {
        let store = ExtensionStore(root: folder)
        try Data("not json".utf8).write(to: store.settingsURL)
        XCTAssertThrowsError(try store.readSettings())
        XCTAssertEqual(try String(contentsOf: store.settingsURL, encoding: .utf8), "not json")
    }
    func testPausedModePreservesExtensionSelection() throws {
        let store = ExtensionStore(root: folder)
        var settings = HelperSettings()
        settings.enabled = ["one": true, "two": false]
        settings.extensionsPaused = true
        try store.writeSettings(settings)
        XCTAssertEqual(try store.readSettings(), settings)
        settings.port = 80
        XCTAssertThrowsError(try store.writeSettings(settings))
        XCTAssertEqual(try store.readSettings().port, 9222)
    }
    func testLegacyPauseSettingMigratesWithoutLosingEnabledExtensions() throws {
        let data = Data(#"{"withoutTweaks":true,"enabled":{"one":true,"two":false}}"#.utf8)
        let settings = try JSONDecoder().decode(HelperSettings.self, from: data)
        XCTAssertTrue(settings.extensionsPaused)
        XCTAssertEqual(settings.enabled, ["one": true, "two": false])
        let updated = try JSONEncoder().encode(settings)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: updated) as? [String: Any])
        XCTAssertEqual(json["extensionsPaused"] as? Bool, true)
        XCTAssertNil(json["withoutTweaks"])
    }
    func testGitHubRepositoryCannotRedirect() {
        XCTAssertNotNil(ExtensionManifest.repositoryURL("b-nnett/codex-pp"))
        for value in ["https://evil.test/", "owner/repo?x=y", "../repo", "owner/..", "owner/repo/extra"] {
            XCTAssertNil(ExtensionManifest.repositoryURL(value))
        }
    }
}
