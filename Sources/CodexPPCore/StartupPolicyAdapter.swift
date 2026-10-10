import Foundation

enum StartupPolicyAdapter {
    static let replacement = "../Frameworks/CodexPPStartup.dylib"
    /// Replace only the unique, NUL-terminated launcher framework path. Preserve
    /// the Mach-O layout, allocator initialization and vendor launcher code.
    static func patch(_ original: Data, frameworkPath: String) throws -> Data {
        guard original.count > 32, Array(original.prefix(8)) == [0xcf,0xfa,0xed,0xfe,0x0c,0x00,0x00,0x01],
              frameworkPath.hasPrefix("Contents/Frameworks/Codex Framework.framework/Versions/"),
              frameworkPath.hasSuffix("/Codex Framework") else { throw PatchError.invalid("Unsupported startup policy launcher contract.") }
        let path = "../" + frameworkPath.dropFirst("Contents/".count)
        let expected = Data((path + "\0").utf8)
        guard let range = original.range(of: expected), original.range(of: expected, in: range.upperBound..<original.count) == nil,
              range.lowerBound > 0, original[range.lowerBound - 1] == 0,
              replacement.utf8.count + 1 <= expected.count else { throw PatchError.invalid("The launcher framework path is missing or ambiguous.") }
        var result = original
        let bytes = Data((replacement + "\0").utf8)
        result.replaceSubrange(range, with: bytes + Data(repeating: 0, count: expected.count - bytes.count))
        return result
    }
}
