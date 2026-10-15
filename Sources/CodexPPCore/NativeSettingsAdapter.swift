import Foundation
import JavaScriptCore

public enum NativeSettingsAdapter {
    public struct Discovery: Codable {
        public let schema: Int
        public let page: Binding
        public let components: [String: Binding]
        public let hooks: [String: String]
    }
    public struct Binding: Codable { public let path: String; public let binding: String }
    private struct Output: Decodable {
        let patches: [Replacement]
        let report: Discovery
    }
    private struct Replacement: Decodable { let path: String; let source: String }

    /// Discovery handles renamed bundles and symbols. Approval still pins the complete app archive.
    public static func discover(archive: AsarArchive, runtime: String) throws -> (patches: [(String, Data)], report: Discovery) {
        try PatchAdapter.approveArchive(archive)
        let paths = try archive.packedFiles(in: "webview/assets").filter {
            $0.hasSuffix(".js") && ["settings-page-", "use-visible-settings-sections-", "general-settings-", "app-initial-", "app-shared-"].contains(where: URL(fileURLWithPath: $0).lastPathComponent.hasPrefix)
        }
        guard paths.count <= 24 else { throw PatchError.invalid("Unexpected Settings module graph size: \(paths.count) modules (at most 24).") }
        var modules: [String: String] = [:]
        for path in paths {
            let data = try archive.data(at: path)
            guard data.count <= 16 * 1024 * 1024 else { throw PatchError.invalid("Unexpected Settings module size.") }
            guard let source = String(data: data, encoding: .utf8) else { throw PatchError.invalid("Settings modules must be UTF-8 JavaScript.") }
            modules[path] = source
        }
        let result: Output
        if let data = try JavaScriptDiscovery.run(archive: archive, adapter: "settings", input: ["modules": modules, "runtime": runtime]) {
            result = try JSONDecoder().decode(Output.self, from: data)
        } else { result = try execute(modules: modules, runtime: runtime) }
        return (result.patches.map { ($0.path, Data($0.source.utf8)) }, result.report)
    }
    public static func patches(archive: AsarArchive, runtime: String) throws -> [(String, Data)] {
        try discover(archive: archive, runtime: runtime).patches
    }
    private static func execute(modules: [String: String], runtime: String) throws -> Output {
        guard let context = JSContext() else { throw PatchError.invalid("Could not create the Settings parser context.") }
        for name in ["acorn", "settings-adapter"] {
            guard let url = Bundle.module.url(forResource: name, withExtension: "js") else { throw PatchError.invalid("The bundled Settings parser is missing.") }
            context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
            if let exception = context.exception { throw PatchError.invalid(exception.toString()) }
        }
        if ProcessInfo.processInfo.environment["CODEXPP_DISCOVERY_TRACE"] == "1" {
            let trace: @convention(block) (String) -> Void = { message in FileHandle.standardError.write(Data((message + "\n").utf8)) }
            context.setObject(trace, forKeyedSubscript: "__ppTrace" as NSString)
        }
        let input: [String: Any] = ["modules": modules, "runtime": runtime]
        context.setObject(String(decoding: try JSONSerialization.data(withJSONObject: input), as: UTF8.self), forKeyedSubscript: "ppInputJSON" as NSString)
        guard let output = context.evaluateScript("JSON.stringify(CodexPPSettingsAdapter.adapt(JSON.parse(ppInputJSON)))")?.toString(), context.exception == nil else {
            throw PatchError.invalid(context.exception?.toString() ?? "Settings discovery failed.")
        }
        return try JSONDecoder().decode(Output.self, from: Data(output.utf8))
    }
}
