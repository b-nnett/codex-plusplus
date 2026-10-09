import Foundation
import JavaScriptCore

public enum NativeBrowserAdapter {
    public static func patch(archive: AsarArchive) throws -> (String, Data) {
        guard archive.headerHash == PatchAdapter.current.headerHash else {
            throw PatchError.invalid("The app archive is not an approved browser build.")
        }
        let paths = try archive.packedFiles(in: ".vite/build").filter {
            let name = URL(fileURLWithPath: $0).lastPathComponent
            return name == "main.js" || (name.hasPrefix("main-") && name.hasSuffix(".js"))
        }
        guard paths.count == 1, let path = paths.first, let context = JSContext() else {
            throw PatchError.invalid("Expected one native browser main module.")
        }
        for name in ["acorn", "browser-adapter"] {
            guard let url = Bundle.module.url(forResource: name, withExtension: "js") else {
                throw PatchError.invalid("The native browser parser is missing.")
            }
            context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
            if let exception = context.exception { throw PatchError.invalid(exception.toString()) }
        }
        guard let source = String(data: try archive.data(at: path), encoding: .utf8) else {
            throw PatchError.invalid("The browser module must be UTF-8 JavaScript.")
        }
        context.setObject(source, forKeyedSubscript: "ppBrowserSource" as NSString)
        guard let result = context.evaluateScript("CodexPPBrowserAdapter.adapt(ppBrowserSource)")?.toString(), context.exception == nil else {
            throw PatchError.invalid(context.exception?.toString() ?? "Native browser discovery failed.")
        }
        return (path, Data(result.utf8))
    }
}
