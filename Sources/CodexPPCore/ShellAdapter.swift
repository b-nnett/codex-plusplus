import Foundation
import JavaScriptCore

public enum ShellAdapter {
    public static func discover(archive: AsarArchive, replacements: [(String, Data)]) throws -> (String, Data) {
        guard archive.headerHash == PatchAdapter.current.headerHash else {
            throw PatchError.invalid("The app archive is not an approved shell build.")
        }
        var matches: [(String, Data)] = []
        for path in try archive.packedFiles(in: "webview/assets").filter({ $0.hasSuffix(".js") }) {
            let data = try archive.data(at: path)
            guard data.count <= 16 * 1024 * 1024, let text = String(data: data, encoding: .utf8) else { continue }
            if text.contains("data-app-shell-frame") && text.contains("data-app-shell-left-panel-appearance") && text.contains("data-app-shell-main-surface") {
                matches.append((path, data))
            }
        }
        guard matches.count == 1, let (path, original) = matches.first else {
            throw PatchError.invalid("Expected exactly one complete shell module.")
        }
        return (path, try patch(source: replacements.first(where: { $0.0 == path })?.1 ?? original))
    }

    public static func patch(source: Data) throws -> Data {
        guard let context = JSContext(), let text = String(data: source, encoding: .utf8) else {
            throw PatchError.invalid("The shell module must be UTF-8 JavaScript.")
        }
        for name in ["acorn", "shell-adapter"] {
            guard let url = Bundle.module.url(forResource: name, withExtension: "js") else {
                throw PatchError.invalid("The shell adapter is missing.")
            }
            context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
            if let error = context.exception { throw PatchError.invalid(error.toString()) }
        }
        guard let runtime = Bundle.module.url(forResource: "shell-runtime", withExtension: "js") else {
            throw PatchError.invalid("The shell runtime is missing.")
        }
        context.setObject(text, forKeyedSubscript: "ppShellSource" as NSString)
        context.setObject(try String(contentsOf: runtime, encoding: .utf8), forKeyedSubscript: "ppShellRuntime" as NSString)
        guard let result = context.evaluateScript("CodexPPShellAdapter.adapt(ppShellSource, ppShellRuntime)")?.toString(), context.exception == nil else {
            throw PatchError.invalid(context.exception?.toString() ?? "Shell discovery failed.")
        }
        return Data(result.utf8)
    }
}
