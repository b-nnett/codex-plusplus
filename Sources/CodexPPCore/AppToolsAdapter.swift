import Foundation

/// Keeps the vendor app-tools peer authorizer intact while ensuring its three
/// inspected client generations remain OpenAI-signed after the root app is
/// locally re-signed.
public enum AppToolsAdapter {
    private static let contract = #"return\{\.\.\.[^{}]{0,128}command:process\.platform===`win32`\?[^{}]{0,256},cwd:[^{}]{0,128},enabled:!1,env:[A-Za-z_$][A-Za-z0-9_$]*\}"#

    public static func patch(_ source: String) throws -> String {
        guard !source.contains("__codexPPWrapAppToolsConfig") else {
            throw PatchError.invalid("The Codex app-tools launch configuration is already patched.")
        }
        let expression = try NSRegularExpression(pattern: contract)
        let range = NSRange(source.startIndex..<source.endIndex, in: source)
        let matches = expression.matches(in: source, range: range)
        guard matches.count == 1, let match = matches.first,
              let swiftRange = Range(match.range, in: source) else {
            throw PatchError.invalid("Expected one Codex app-tools launch configuration contract.")
        }
        let original = source[swiftRange]
        return source.replacingCharacters(in: swiftRange, with: "return globalThis.__codexPPWrapAppToolsConfig(" + original.dropFirst("return".count) + ")")
    }
}
