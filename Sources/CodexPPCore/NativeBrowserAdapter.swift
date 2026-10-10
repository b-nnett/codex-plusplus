import Foundation
import JavaScriptCore

public enum NativeBrowserAdapter {
    public static func patch(archive: AsarArchive) throws -> (String, Data) {
        try PatchAdapter.approveArchive(archive)
        let paths = try archive.packedFiles(in: ".vite/build").filter {
            let name = URL(fileURLWithPath: $0).lastPathComponent
            return name == "main.js" || (name.hasPrefix("main-") && name.hasSuffix(".js"))
        }
        guard paths.count == 1, let path = paths.first else {
            throw PatchError.invalid("Expected one native browser main module.")
        }
        guard let source = String(data: try archive.data(at: path), encoding: .utf8) else { throw PatchError.invalid("The browser module must be UTF-8 JavaScript.") }
        if let output = try JavaScriptDiscovery.run(archive: archive, adapter: "browser", input: ["source": source]) {
            let browser = try JSONDecoder().decode(String.self, from: output)
            return (path, Data(try AppToolsAdapter.patch(browser).utf8))
        }
        guard let context = JSContext() else { throw PatchError.invalid("Could not create the browser parser.") }
        for name in ["acorn", "browser-adapter"] {
            guard let url = Bundle.module.url(forResource: name, withExtension: "js") else {
                throw PatchError.invalid("The native browser parser is missing.")
            }
            context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
            if let exception = context.exception { throw PatchError.invalid(exception.toString()) }
        }
        context.setObject(source, forKeyedSubscript: "ppBrowserSource" as NSString)
        guard let result = context.evaluateScript("CodexPPBrowserAdapter.adapt(ppBrowserSource)")?.toString(), context.exception == nil else {
            throw PatchError.invalid(context.exception?.toString() ?? "Native browser discovery failed.")
        }
        return (path, Data(try AppToolsAdapter.patch(result).utf8))
    }
}
