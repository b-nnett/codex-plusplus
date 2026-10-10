import Foundation

/// Durable Sparkle-to-helper handoff. No downloaded app runs until its complete
/// archive, framework, local signature and startup probe have been validated.
public struct UpdateHandoff: Codable, Sendable {
    public let schema: Int
    public let appPath: String
    public let helperPath: String
    public let oldPID: Int32
    public let targetBuild: String
    public let createdAt: TimeInterval

    public static func file(in support: URL) -> URL {
        support.appendingPathComponent("Patching/update-handoff.json")
    }
    public func validate(app: URL, helper: URL, now: Date = Date()) throws {
        guard schema == 1, appPath == app.path, helperPath == helper.path,
              oldPID > 0, createdAt <= now.timeIntervalSince1970 + 60,
              now.timeIntervalSince1970 - createdAt < 86400,
              targetBuild.range(of: "^[0-9]{1,12}$", options: .regularExpression) != nil else {
            throw PatchError.invalid("Invalid or expired update handoff. The updated app has been left closed.")
        }
    }
    public func replacementAdapter(at app: URL) throws -> PatchAdapter? {
        let file = app.appendingPathComponent("Contents/Info.plist")
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        let data = try Data(contentsOf: file)
        let info = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        guard info?["CFBundleVersion"] as? String == targetBuild else { return nil }
        return try PatchAdapter.forBundle(app)
    }
}
