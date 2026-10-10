import Foundation
import JavaScriptCore

public enum BookmarksAdapter {
    private struct Output: Decodable { let patches: [Replacement] }
    private struct Replacement: Decodable { let path: String; let source: String }
    public static func discover(archive: AsarArchive, replacements: [(String, Data)]) throws -> [(String, Data)] {
        try PatchAdapter.approveArchive(archive)
        var modules: [String: String] = [:]
        let families = ["options-menu-view-", "page-", "tab-content-", "thread-app-shell-chrome-"]
        for path in try archive.packedFiles(in: "webview/assets").filter({ path in
            path.hasSuffix(".js") && families.contains { URL(fileURLWithPath: path).lastPathComponent.hasPrefix($0) }
        }) {
            let data = try replacements.first(where: { $0.0 == path })?.1 ?? archive.data(at: path)
            guard data.count <= 16 * 1024 * 1024, let source = String(data: data, encoding: .utf8) else { continue }
            if (source.contains("threadWorkspace.newTab.suggested.heading") && source.contains("onNavigate")) ||
                (source.contains("onOpenBrowserSettings") && source.contains("onOpenHistory")) ||
                (source.contains("renderSlots") && source.contains("isFloatingComposerVisible")) { modules[path] = source }
        }
        guard modules.count <= 12, let runtimeURL = Bundle.module.url(forResource: "bookmarks-runtime", withExtension: "js") else { throw PatchError.invalid("Unexpected bookmarks module graph or missing runtime.") }
        let runtime = try String(contentsOf: runtimeURL, encoding: .utf8)
        let output: Data
        if let parsed = try JavaScriptDiscovery.run(archive: archive, adapter: "bookmarks", input: ["modules": modules, "runtime": runtime]) { output = parsed }
        else {
            guard let context = JSContext() else { throw PatchError.invalid("Could not create the bookmarks parser.") }
            for name in ["acorn", "bookmarks-adapter"] {
                guard let url = Bundle.module.url(forResource: name, withExtension: "js") else { throw PatchError.invalid("The bookmarks parser is missing.") }
                context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
                if let error = context.exception { throw PatchError.invalid(error.toString()) }
            }
            context.setObject(String(decoding: try JSONSerialization.data(withJSONObject: modules), as: UTF8.self), forKeyedSubscript: "ppBookmarksModules" as NSString)
            context.setObject(runtime, forKeyedSubscript: "ppBookmarksRuntime" as NSString)
            guard let result = context.evaluateScript("JSON.stringify(CodexPPBookmarksAdapter.adapt(JSON.parse(ppBookmarksModules), ppBookmarksRuntime))")?.toString(), context.exception == nil else { throw PatchError.invalid(context.exception?.toString() ?? "Bookmarks discovery failed.") }
            output = Data(result.utf8)
        }
        var patches = try JSONDecoder().decode(Output.self, from: output).patches.map { ($0.path, Data($0.source.utf8)) }
        let initialPaths = try archive.packedFiles(in: "webview/assets").filter { URL(fileURLWithPath: $0).lastPathComponent.hasPrefix("app-initial-") && $0.hasSuffix(".js") }
        guard initialPaths.count == 1, let initialPath = initialPaths.first else { throw PatchError.invalid("Expected one bookmarks startup module.") }
        let initialData = try replacements.first(where: { $0.0 == initialPath })?.1 ?? archive.data(at: initialPath)
        var initial = Data(try String(contentsOf: runtimeURL, encoding: .utf8).utf8)
        initial.append(Data("\n".utf8)); initial.append(initialData)
        patches.append((initialPath, initial))
        return patches
    }
}
