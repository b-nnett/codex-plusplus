import Foundation

/// Recipes live inside the signature-verified helper, never in writable caches.
struct ReviewedPatchRecipe: Decodable {
    struct Edit: Decodable { let start: Int; let end: Int; let data: Data }
    struct Replacement: Decodable {
        let path: String
        let sourceHash: String
        let patchedHash: String
        let edits: [Edit]
        func apply(to source: Data) throws -> Data {
            guard sha256(source) == sourceHash else { throw PatchError.invalid("The reviewed patch recipe source changed.") }
            var result = Data(), cursor = 0
            for edit in edits {
                guard edit.start >= cursor, edit.end >= edit.start, edit.end <= source.count else {
                    throw PatchError.invalid("The reviewed patch recipe has invalid edit bounds.")
                }
                result.append(source.subdata(in: cursor..<edit.start)); result.append(edit.data); cursor = edit.end
            }
            result.append(source.subdata(in: cursor..<source.count))
            guard sha256(result) == patchedHash else { throw PatchError.invalid("The reviewed patch recipe output failed verification.") }
            return result
        }
    }
    let schema: Int
    let headerHash: String
    let version: String
    let build: String
    let settingsReport: NativeSettingsAdapter.Discovery
    /// The startup discovery report of the patch the recipe was taken from.
    let startupReport: StartupDiscoveryReport?
    let replacements: [Replacement]

    /// Caller verifies the complete helper signature before reading its resources.
    static func load(helper: URL, archive: AsarArchive, adapter: PatchAdapter) throws -> ReviewedPatchRecipe? {
        let path = helper.appendingPathComponent("Contents/Resources/ReviewedPatches/\(archive.headerHash).json")
        guard FileManager.default.fileExists(atPath: path.path) else { return nil }
        guard path.resolvingSymlinksInPath().path.hasPrefix(helper.resolvingSymlinksInPath().path + "/") else {
            throw PatchError.invalid("The reviewed patch recipe is outside the helper.")
        }
        let recipe = try JSONDecoder().decode(Self.self, from: Data(contentsOf: path))
        guard recipe.schema == 1, recipe.headerHash == archive.headerHash, recipe.version == adapter.version,
              recipe.build == adapter.build, (1...16).contains(recipe.replacements.count),
              Set(recipe.replacements.map(\.path)).count == recipe.replacements.count,
              !recipe.replacements.contains(where: { $0.path == adapter.main }) else {
            throw PatchError.invalid("The reviewed patch recipe does not match this release.")
        }
        return recipe
    }
    func patches(in archive: AsarArchive) throws -> [(String, Data)] {
        try replacements.map { ($0.path, try $0.apply(to: archive.data(at: $0.path))) }
    }
}
