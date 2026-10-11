import Foundation

public struct HelperSettings: Codable, Equatable, Sendable {
    public var appPath = "/Applications/ChatGPT.app"
    public var port = 9222
    public var extensionsPaused = false
    public var enabled: [String: Bool] = [:]
    public var githubRepo: String? = nil
    public var settingsIntent = 0
    public var selectedExtensionId: String? = nil
    public init() {}

    private enum CodingKeys: String, CodingKey {
        case appPath, port, extensionsPaused, enabled, githubRepo, settingsIntent, selectedExtensionId
        case legacyWithoutTweaks = "withoutTweaks"
    }
    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        appPath = try values.decodeIfPresent(String.self, forKey: .appPath) ?? "/Applications/ChatGPT.app"
        port = try values.decodeIfPresent(Int.self, forKey: .port) ?? 9222
        extensionsPaused = try values.decodeIfPresent(Bool.self, forKey: .extensionsPaused)
            ?? values.decodeIfPresent(Bool.self, forKey: .legacyWithoutTweaks) ?? false
        enabled = try values.decodeIfPresent([String: Bool].self, forKey: .enabled) ?? [:]
        githubRepo = try values.decodeIfPresent(String.self, forKey: .githubRepo)
        settingsIntent = try values.decodeIfPresent(Int.self, forKey: .settingsIntent) ?? 0
        selectedExtensionId = try values.decodeIfPresent(String.self, forKey: .selectedExtensionId)
    }
    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(appPath, forKey: .appPath)
        try values.encode(port, forKey: .port)
        try values.encode(extensionsPaused, forKey: .extensionsPaused)
        try values.encode(enabled, forKey: .enabled)
        try values.encodeIfPresent(githubRepo, forKey: .githubRepo)
        try values.encode(settingsIntent, forKey: .settingsIntent)
        try values.encodeIfPresent(selectedExtensionId, forKey: .selectedExtensionId)
    }

    public func validate() throws {
        if let githubRepo, ExtensionManifest.repositoryURL(githubRepo) == nil { throw HelperError.message("Use a GitHub owner/repository pair.") }
        guard (1024...65535).contains(port) else { throw HelperError.message("The legacy compatibility port must be between 1024 and 65535.") }
        guard appPath.hasPrefix("/"), appPath.hasSuffix(".app") else { throw HelperError.message("Choose the installed Codex app bundle.") }
        guard settingsIntent >= 0, settingsIntent < Int.max else { throw HelperError.message("Invalid Settings navigation state.") }
        if let selectedExtensionId,
           selectedExtensionId.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$", options: .regularExpression) == nil {
            throw HelperError.message("Invalid selected extension.")
        }
    }
}

public enum HelperError: LocalizedError {
    case message(String)
    public var errorDescription: String? { switch self { case .message(let message): message } }
}

public struct ExtensionManifest: Codable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let version: String
    public let description: String?
    public let main: String
    public let scope: String
    public let githubRepo: String?

    public func validate() throws {
        guard id.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$", options: .regularExpression) != nil,
              id != ".", id != ".." else { throw HelperError.message("Extension IDs may contain letters, numbers, dots, underscores, and hyphens.") }
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !version.isEmpty else { throw HelperError.message("The extension needs a name and version.") }
        guard scope == "renderer" else { throw HelperError.message("This helper currently supports renderer extensions. Older main-process extensions need to be ported.") }
        guard !main.isEmpty, !main.hasPrefix("/"), !main.split(separator: "/").contains(".."), main.hasSuffix(".js") else { throw HelperError.message("The extension entry must be a JavaScript file inside its folder.") }
        if let githubRepo, Self.repositoryURL(githubRepo) == nil { throw HelperError.message("githubRepo must be an owner/repository pair.") }
    }

    public static func repositoryURL(_ repo: String) -> URL? {
        guard repo.range(of: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", options: .regularExpression) != nil,
              !repo.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }) else { return nil }
        return URL(string: "https://github.com/\(repo)")
    }
}

public struct InstalledExtension: Identifiable, Sendable {
    public var id: String { manifest.id }
    public let manifest: ExtensionManifest
    public let directory: URL
    public let code: String
}

public struct ExtensionStore: Sendable {
    public let root: URL
    public var directory: URL { root.appendingPathComponent("Extensions", isDirectory: true) }
    public var settingsURL: URL { root.appendingPathComponent("settings.json") }
    public init(root: URL) { self.root = root }

    public func prepare() throws { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
    public func readSettings() throws -> HelperSettings {
        guard FileManager.default.fileExists(atPath: settingsURL.path) else { return HelperSettings() }
        let value = try JSONDecoder().decode(HelperSettings.self, from: Data(contentsOf: settingsURL))
        try value.validate()
        return value
    }
    public func writeSettings(_ settings: HelperSettings) throws {
        try settings.validate()
        try prepare()
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(settings).write(to: settingsURL, options: .atomic)
    }
    public func load(_ folder: URL) throws -> InstalledExtension {
        let resolved = folder.resolvingSymlinksInPath().standardizedFileURL
        let manifestURL = resolved.appendingPathComponent("manifest.json").resolvingSymlinksInPath()
        guard manifestURL.path.hasPrefix(resolved.path + "/") else { throw HelperError.message("The manifest must stay inside the extension folder.") }
        let manifest = try JSONDecoder().decode(ExtensionManifest.self, from: Data(contentsOf: manifestURL))
        try manifest.validate()
        let entry = resolved.appendingPathComponent(manifest.main).resolvingSymlinksInPath().standardizedFileURL
        guard entry.path.hasPrefix(resolved.path + "/") else { throw HelperError.message("The entry file points outside the extension folder.") }
        let data = try Data(contentsOf: entry)
        guard data.count <= 2_000_000, let code = String(data: data, encoding: .utf8) else { throw HelperError.message("The entry must be UTF-8 JavaScript, no larger than 2 MB.") }
        return InstalledExtension(manifest: manifest, directory: resolved, code: code)
    }
    public func list() throws -> (extensions: [InstalledExtension], problems: [String]) {
        try prepare()
        var items: [InstalledExtension] = [], problems: [String] = []
        for folder in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil, options: .skipsHiddenFiles) {
            do {
                let item = try load(folder)
                guard folder.lastPathComponent == item.id else { throw HelperError.message("Folder name must match manifest ID.") }
                items.append(item)
            } catch { problems.append("\(folder.lastPathComponent): \(error.localizedDescription)") }
        }
        return (items.sorted { $0.manifest.name.localizedCaseInsensitiveCompare($1.manifest.name) == .orderedAscending }, problems)
    }
    public func install(from folder: URL) throws -> InstalledExtension {
        let source = try load(folder)
        try prepare()
        let destination = directory.appendingPathComponent(source.id)
        guard source.directory != destination.resolvingSymlinksInPath().standardizedFileURL else { return source }
        let stage = directory.appendingPathComponent(".install-" + UUID().uuidString)
        let backup = directory.appendingPathComponent(".backup-" + UUID().uuidString)
        let fm = FileManager.default
        defer { try? fm.removeItem(at: stage) }
        try fm.copyItem(at: source.directory, to: stage)
        _ = try load(stage)
        let hadPrevious = fm.fileExists(atPath: destination.path)
        if hadPrevious { try fm.moveItem(at: destination, to: backup) }
        do { try fm.moveItem(at: stage, to: destination) }
        catch {
            if hadPrevious { try? fm.moveItem(at: backup, to: destination) }
            throw error
        }
        if hadPrevious { try? fm.removeItem(at: backup) }
        return try load(destination)
    }
}
