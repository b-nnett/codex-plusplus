import Foundation
import JavaScriptCore

/// Exposes the sidebar internals better-sidebar needs under stable names.
/// Optional by design: an unrecognized build skips this one contract, and the
/// extension reports what is missing, instead of blocking the whole patch.
public enum SidebarAdapter {
    /// Why each capability matched, for reviewing a new app build.
    public struct Evidence: Codable, Sendable { public let local: String?; public let why: String }
    public struct Result: Sendable {
        public let path: String
        public let source: Data
        public let missing: [String]
        public let report: [String: Evidence]
    }
    struct Output: Decodable { let source: String; let missing: [String]; let report: [String: Evidence] }

    public static func discover(archive: AsarArchive, replacements: [(String, Data)]) -> Result? {
        try? diagnose(archive: archive, replacements: replacements)
    }

    /// `discover`, keeping its error (for build reviews).
    public static func diagnose(archive: AsarArchive, replacements: [(String, Data)]) throws -> Result {
        try PatchAdapter.approveArchive(archive)
        let paths = try archive.packedFiles(in: "webview/assets").filter {
            let name = URL(fileURLWithPath: $0).lastPathComponent
            return name.hasPrefix("app-shared-") && name.hasSuffix(".js")
        }
        guard paths.count == 1, let path = paths.first else { throw PatchError.invalid("Expected one app-shared- module, found \(paths.count).") }
        let data = try replacements.first(where: { $0.0 == path })?.1 ?? archive.data(at: path)
        guard data.count <= 32 * 1024 * 1024, let source = String(data: data, encoding: .utf8) else { throw PatchError.invalid("The sidebar module is oversized or not UTF-8.") }
        let output = try adapt(source: source, archive: archive)
        return Result(path: path, source: Data(output.source.utf8), missing: output.missing, report: output.report)
    }

    private static func adapt(source: String, archive: AsarArchive) throws -> Output {
        if let output = try JavaScriptDiscovery.run(archive: archive, adapter: "sidebar", input: ["source": source]) {
            return try JSONDecoder().decode(Output.self, from: output)
        }
        return try adaptInProcess(source: source)
    }

    /// JavaScriptCore fallback when the app's signed Node runtime is absent.
    static func adaptInProcess(source: String) throws -> Output {
        guard let context = JSContext() else { throw PatchError.invalid("Could not create the sidebar parser.") }
        for name in ["acorn", "sidebar-adapter"] {
            guard let url = Bundle.module.url(forResource: name, withExtension: "js") else {
                throw PatchError.invalid("The sidebar parser is missing.")
            }
            context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
            if let exception = context.exception { throw PatchError.invalid(exception.toString()) }
        }
        context.setObject(source, forKeyedSubscript: "ppSidebarSource" as NSString)
        guard let result = context.evaluateScript("JSON.stringify(CodexPPSidebarAdapter.adapt(ppSidebarSource))")?.toString(), context.exception == nil else {
            throw PatchError.invalid(context.exception?.toString() ?? "Sidebar discovery failed.")
        }
        return try JSONDecoder().decode(Output.self, from: Data(result.utf8))
    }
}

struct SidebarDiscoveryReport: Encodable {
    let missing: [String]
    let capabilities: [String: SidebarAdapter.Evidence]
}
