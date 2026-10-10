import XCTest
@testable import CodexPPCore

final class UpdateHandoffTests: XCTestCase {
    func testHandoffRejectsWrongTargetHelperBuildAndExpiredRequests() throws {
        let app = URL(fileURLWithPath: "/Applications/ChatGPT.app")
        let helper = URL(fileURLWithPath: "/Applications/Codex++.app")
        let now = Date()
        func ticket(_ change: [String: Any] = [:]) throws -> UpdateHandoff {
            var json: [String: Any] = ["schema":1,"appPath":app.path,"helperPath":helper.path,
                "oldPID":123,"targetBuild":PatchAdapter.current.build,"createdAt":now.timeIntervalSince1970]
            json.merge(change) { _, new in new }
            return try JSONDecoder().decode(UpdateHandoff.self, from: JSONSerialization.data(withJSONObject: json))
        }
        try ticket().validate(app: app, helper: helper, now: now)
        for change in [["appPath":"/tmp/Other.app"],["helperPath":"/tmp/Other.app"],
                       ["targetBuild":"unknown"],["oldPID":0],["schema":2],
                       ["createdAt":now.timeIntervalSince1970-86401],
                       ["createdAt":now.timeIntervalSince1970+120]] {
            XCTAssertThrowsError(try ticket(change).validate(app: app, helper: helper, now: now))
        }
    }
    func testReplacementWaitsForExactBuildAndRejectsVersionMismatch() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let contents = root.appendingPathComponent("Contents")
        try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
        func write(_ build: String, _ version: String) throws {
            try PropertyListSerialization.data(fromPropertyList: ["CFBundleVersion":build,"CFBundleShortVersionString":version], format: .xml, options: 0).write(to: contents.appendingPathComponent("Info.plist"))
        }
        let ticket = UpdateHandoff(schema:1,appPath:root.path,helperPath:"/Applications/Codex++.app",oldPID:123,targetBuild:PatchAdapter.current.build,createdAt:Date().timeIntervalSince1970)
        try write(PatchAdapter.previous.build, PatchAdapter.previous.version)
        XCTAssertNil(try ticket.replacementAdapter(at: root))
        try write(PatchAdapter.current.build, "unexpected")
        XCTAssertThrowsError(try ticket.replacementAdapter(at: root))
        try write(PatchAdapter.current.build, PatchAdapter.current.version)
        XCTAssertEqual(try ticket.replacementAdapter(at: root)?.id, PatchAdapter.current.id)
    }
}
