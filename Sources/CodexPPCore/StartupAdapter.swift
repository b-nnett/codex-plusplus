import Foundation
import JavaScriptCore

/// Startup fast path for the renderer: cache-first Statsig gating and a
/// deferred dictation-cue preload. Optional by design: each edit applies only
/// when its code shape matches exactly once, and an unrecognised build starts
/// exactly as it does unpatched instead of blocking the patch.
public enum StartupAdapter {
    public struct Result: Sendable {
        public let replacements: [(String, Data)]
        public let applied: [String: String]
        public let skipped: [String: String]
    }
    struct Output: Decodable { let applied: [String: String]; let skipped: [String: String]; let shared: String?; let initial: String?; let requirements: String?; let html: String?; let main: String?; let network: String?; let checkout: String?; let trash: String?; let appearance: String?; let appServer: String?; let remoteSettings: String?; let xtermOutput: String?; let terminalPanel: String?; let primary: String?; let ambient: String?; let css: [String: String]? }

    public static func discover(archive: AsarArchive, replacements: [(String, Data)]) -> Result? {
        do {
            try PatchAdapter.approveArchive(archive)
            func module(_ prefix: String, in directory: String = "webview/assets") throws -> (String, String)? {
                let paths = try archive.packedFiles(in: directory).filter {
                    let name = URL(fileURLWithPath: $0).lastPathComponent
                    return name.hasPrefix(prefix) && name.hasSuffix(".js")
                }
                guard paths.count == 1, let path = paths.first else { return nil }
                let data = try replacements.first(where: { $0.0 == path })?.1 ?? archive.data(at: path)
                guard data.count <= 32 * 1024 * 1024, let source = String(data: data, encoding: .utf8) else { return nil }
                return (path, source)
            }
            let shared = try module("app-shared-"), initial = try module("app-initial-")
            let requirements = try module("startup-requirements-", in: ".vite/build")
            let main = try module("main-", in: ".vite/build")
            // The app-server websocket transport (its keep-alive ping).
            let network = try module("application-network-startup-", in: ".vite/build")
            // The Remote Connections settings page (its refresh poll).
            let remoteSettings = try module("remote-connections-settings-")
            // The app-server connection and remote-control websocket live in one
            // of several .vite/build/src-* chunks.
            func buildModule(containing markers: [String]) throws -> (String, String)? {
                let paths = try archive.packedFiles(in: ".vite/build").filter {
                    let name = URL(fileURLWithPath: $0).lastPathComponent
                    return name.hasPrefix("src-") && name.hasSuffix(".js")
                }
                let matches = try paths.compactMap { path -> (String, String)? in
                    let data = try replacements.first(where: { $0.0 == path })?.1 ?? archive.data(at: path)
                    guard data.count <= 32 * 1024 * 1024, let source = String(data: data, encoding: .utf8),
                          markers.allSatisfy(source.contains) else { return nil }
                    return (path, source)
                }
                return matches.count == 1 ? matches[0] : nil
            }
            let appServer = try buildModule(containing: ["(`AppServerConnection`)"])
            // The composer (its catch-up prediction query).
            let primary = try module("app-primary-")
            // The main-process ambient suggestions generator, in one of the src-* chunks.
            // When it is the app-server chunk, its edit is made through that input.
            let ambientCandidate = try buildModule(containing: ["ambientSuggestionsModel", "first-plugin-connect"])
            let ambient = ambientCandidate?.0 == appServer?.0 ? nil : ambientCandidate
            // The background-command output terminal, and the integrated terminal
            // (two chunks share its prefix; only one holds the panel).
            let xtermOutput = try module("xterm-output-panel-")
            let terminalPanel: (String, String)? = try {
                let paths = try archive.packedFiles(in: "webview/assets").filter {
                    let name = URL(fileURLWithPath: $0).lastPathComponent
                    return name.hasPrefix("terminal-panel-") && name.hasSuffix(".js")
                }
                let matches = try paths.compactMap { path -> (String, String)? in
                    let data = try replacements.first(where: { $0.0 == path })?.1 ?? archive.data(at: path)
                    guard data.count <= 8 * 1024 * 1024, let source = String(data: data, encoding: .utf8),
                          source.contains("TerminalPanel"), source.contains("ResizeObserver") else { return nil }
                    return (path, source)
                }
                return matches.count == 1 ? matches[0] : nil
            }()
            // The checkout webview hosts live in one of several webview-page-* chunks.
            let checkout: (String, String)? = try {
                let paths = try archive.packedFiles(in: "webview/assets").filter {
                    let name = URL(fileURLWithPath: $0).lastPathComponent
                    return name.hasPrefix("webview-page-") && name.hasSuffix(".js")
                }
                let matches = try paths.compactMap { path -> (String, String)? in
                    let data = try replacements.first(where: { $0.0 == path })?.1 ?? archive.data(at: path)
                    guard data.count <= 8 * 1024 * 1024, let source = String(data: data, encoding: .utf8),
                          source.contains("CheckoutPricingWebviewHost") else { return nil }
                    return (path, source)
                }
                return matches.count == 1 ? matches[0] : nil
            }()
            // Space chunks, picked by content when several hashed copies share a prefix.
            func spaceModule(_ prefix: String, containing marker: String) throws -> (String, String)? {
                let paths = try archive.packedFiles(in: "webview/assets").filter {
                    let name = URL(fileURLWithPath: $0).lastPathComponent
                    return name.hasPrefix(prefix) && name.hasSuffix(".js")
                }
                let matches = try paths.compactMap { path -> (String, String)? in
                    let data = try replacements.first(where: { $0.0 == path })?.1 ?? archive.data(at: path)
                    guard data.count <= 8 * 1024 * 1024, let source = String(data: data, encoding: .utf8), source.contains(marker) else { return nil }
                    return (path, source)
                }
                return matches.count == 1 ? matches[0] : nil
            }
            // Empty Trash in a Space, and a Space's icon and colour picker.
            let trash = try spaceModule("space-trash-items-", containing: "`/pages/archived`")
            let appearance = try spaceModule("space-appearance-button-", containing: "/spaces/v2/{space_id}/appearance")
            // index.html and its entry module, for the entry preload hints.
            let htmlPath = "webview/index.html"
            let htmlData = try replacements.first(where: { $0.0 == htmlPath })?.1 ?? archive.data(at: htmlPath)
            let html = String(data: htmlData, encoding: .utf8)
            // The entry is the page's module script, not any index-* chunk.
            let entry: (String, String)? = try html.flatMap { page -> (String, String)? in
                guard let match = page.firstMatch(of: /<script type="module" crossorigin src="\.\/assets\/([\w.-]+\.js)">/) else { return nil }
                let path = "webview/assets/\(match.1)"
                guard let source = String(data: try archive.data(at: path), encoding: .utf8) else { return nil }
                return (path, source)
            }
            var input: [String: Any] = ["diagnostics": PatchAdapter.experimentsEnabled]
            if let shared { input["shared"] = shared.1 }
            if let initial { input["initial"] = initial.1 }
            if let requirements { input["requirements"] = requirements.1 }
            if let main { input["main"] = main.1 }
            if let network { input["network"] = network.1 }
            if let appServer { input["appServer"] = appServer.1 }
            if let remoteSettings { input["remoteSettings"] = remoteSettings.1 }
            if let checkout { input["checkout"] = checkout.1 }
            if let trash { input["trash"] = trash.1 }
            if let appearance { input["appearance"] = appearance.1 }
            if let xtermOutput { input["xtermOutput"] = xtermOutput.1 }
            if let terminalPanel { input["terminalPanel"] = terminalPanel.1 }
            // The xterm WebGL renderer addon, inlined into the terminal panel.
            if terminalPanel != nil, let url = Bundle.module.url(forResource: "xterm-addon-webgl", withExtension: "js"),
               let addon = try? String(contentsOf: url, encoding: .utf8) { input["webglAddon"] = addon }
            if let primary { input["primary"] = primary.1 }
            if let ambient { input["ambient"] = ambient.1 }
            if let html, let entry { input["html"] = html; input["entry"] = entry.1 }
            // Every stylesheet, for the viewport container-query rewrite.
            var stylesheets: [String: String] = [:]
            for path in try archive.packedFiles(in: "webview/assets") where path.hasSuffix(".css") {
                let data = try replacements.first(where: { $0.0 == path })?.1 ?? archive.data(at: path)
                if data.count <= 8 * 1024 * 1024, let text = String(data: data, encoding: .utf8) { stylesheets[path] = text }
            }
            input["css"] = stylesheets
            let output = try adapt(input: input, archive: archive)
            var result: [(String, Data)] = []
            if let source = output.shared, let shared { result.append((shared.0, Data(source.utf8))) }
            if let source = output.initial, let initial { result.append((initial.0, Data(source.utf8))) }
            if let source = output.requirements, let requirements { result.append((requirements.0, Data(source.utf8))) }
            if let source = output.html { result.append((htmlPath, Data(source.utf8))) }
            if let source = output.main, let main { result.append((main.0, Data(source.utf8))) }
            if let source = output.network, let network { result.append((network.0, Data(source.utf8))) }
            if let source = output.appServer, let appServer { result.append((appServer.0, Data(source.utf8))) }
            if let source = output.remoteSettings, let remoteSettings { result.append((remoteSettings.0, Data(source.utf8))) }
            if let source = output.checkout, let checkout { result.append((checkout.0, Data(source.utf8))) }
            if let source = output.trash, let trash { result.append((trash.0, Data(source.utf8))) }
            if let source = output.appearance, let appearance { result.append((appearance.0, Data(source.utf8))) }
            if let source = output.xtermOutput, let xtermOutput { result.append((xtermOutput.0, Data(source.utf8))) }
            if let source = output.terminalPanel, let terminalPanel { result.append((terminalPanel.0, Data(source.utf8))) }
            if let source = output.primary, let primary { result.append((primary.0, Data(source.utf8))) }
            if let source = output.ambient, let ambient { result.append((ambient.0, Data(source.utf8))) }
            for (path, source) in output.css ?? [:] where stylesheets[path] != nil { result.append((path, Data(source.utf8))) }
            return Result(replacements: result, applied: output.applied, skipped: output.skipped)
        } catch {
            return nil
        }
    }

    private static func adapt(input: [String: Any], archive: AsarArchive) throws -> Output {
        if let output = try JavaScriptDiscovery.run(archive: archive, adapter: "startup", input: input) {
            return try JSONDecoder().decode(Output.self, from: output)
        }
        return try adaptInProcess(input: input)
    }

    /// JavaScriptCore fallback when the app's signed Node runtime is absent.
    static func adaptInProcess(input: [String: Any]) throws -> Output {
        guard let context = JSContext() else { throw PatchError.invalid("Could not create the startup parser.") }
        for name in ["acorn", "startup-adapter"] {
            guard let url = Bundle.module.url(forResource: name, withExtension: "js") else {
                throw PatchError.invalid("The startup parser is missing.")
            }
            context.evaluateScript(try String(contentsOf: url, encoding: .utf8))
            if let exception = context.exception { throw PatchError.invalid(exception.toString()) }
        }
        context.setObject(input, forKeyedSubscript: "ppStartupInput" as NSString)
        guard let result = context.evaluateScript("JSON.stringify(CodexPPStartupAdapter.adapt(ppStartupInput))")?.toString(), context.exception == nil else {
            throw PatchError.invalid(context.exception?.toString() ?? "Startup discovery failed.")
        }
        return try JSONDecoder().decode(Output.self, from: Data(result.utf8))
    }
}

struct StartupDiscoveryReport: Codable {
    let applied: [String: String]
    let skipped: [String: String]
}

/// Which startup speed-ups matched the installed ChatGPT build, read from the
/// discovery report written at patch time. Diagnostic edits are not counted.
public struct StartupStatus: Equatable, Sendable {
    public static let reportPath = "Contents/Resources/codexpp-startup-discovery.json"
    static let diagnostics: Set<String> = ["appGateReasons", "chunkTimings", "loadingGateTimings", "opaqueSurfaceExperiment", "policyPhaseTimings", "queryTimings"]
    static let labels: [String: String] = [
        "statsigCacheFirst": "Cached feature flags", "statsigUserCacheFirst": "Cached feature flags for the signed-in user",
        "statsigBootstrapCacheFirst": "Cached sign-in bootstrap", "settingsCacheFirst": "Cached settings",
        "startupRevealUnthrottled": "Immediate first render", "deferDictationCues": "Deferred dictation sounds",
        "learnedStartupPreload": "Learned chunk preload", "entryPreload": "Entry chunk preload",
        "shellEnvironmentCacheFirst": "Cached shell environment", "authStorageGateCacheFirst": "Cached auth storage flag",
        "deferDockIcon": "Deferred Dock icon", "caretBlinkTimeout": "Idle text cursor", "compositorShimmer": "Compositor loading shimmer", "viewportContainerQueries": "Breakpoints without full restyles", "shellResizeSync": "Steady chat column while resizing", "coalesceBrowserMenuRefresh": "Fewer menu rebuilds while resizing", "lazyPageWindowPrewarm": "On-demand Page window",
        "lazyAvatarOverlayPrewarm": "On-demand avatar overlay", "lazyDetachedWindowPrewarm": "On-demand detached window", "lazyHotkeyWindowPrewarm": "On-demand hotkey window", "lazyCheckoutPricingPrewarm": "On-demand upgrade page", "lazyCheckoutCreditPrewarm": "On-demand credit checkout", "skipHiddenThreadRefetch": "No MCP refetch for hidden threads",
        "wakeAwarePongTimeout": "Connections kept across sleep", "plainSettledWords": "Lighter streaming text",
        "capIdlePageSessions": "Fewer idle Page connections", "childPagesPollOnSpaceRoute": "Folder refreshes only in Spaces",
        "trashPaginationGuard": "Bounded Empty Trash listing", "queuedAppearanceChange": "Space appearance changes kept while saving",
        "stderrNotConnectionError": "App-server warnings not shown as connection errors", "remoteControlBackoff": "Remote-control reconnect backoff",
        "pubsubReconnectCap": "Prompt ChatGPT live-update reconnects", "resumeVisibleThreadFirst": "Open thread resumed first after reconnect",
        "remoteSettingsPollWhenVisible": "Remote Connections refresh only while visible", "quietSidebarRebind": "Quieter Browser sidebar log",
        "terminalOutputAppend": "Background terminal output without rewrites", "coalescedTerminalResize": "One terminal refit per frame", "batchedPtyOutput": "Batched terminal output", "terminalWebglRenderer": "GPU terminal rendering",
        "ambientSuggestionsOnDemand": "Home suggestions only when visited", "ambientSuggestionsLowEffort": "Low-effort home suggestions",
        "catchUpPredictionWhenShown": "Catch-up predictions only when shown", "gitStateWhenChanged": "Git state only when changed",
        "cachedAutoHighlightLanguage": "Cached code language while streaming",
    ]
    public let active: [String]
    /// Speed-ups that did not match this build, with the adapter's reason.
    public let missing: [(name: String, reason: String)]

    public static func read(app: URL) -> StartupStatus? {
        guard let data = try? Data(contentsOf: app.appendingPathComponent(reportPath)),
              let report = try? JSONDecoder().decode(StartupDiscoveryReport.self, from: data) else { return nil }
        let active = report.applied.keys.filter { !diagnostics.contains($0) }.map(label).sorted()
        let missing = report.skipped.filter { !diagnostics.contains($0.key) }.map { (name: label($0.key), reason: $0.value) }.sorted { $0.name < $1.name }
        return StartupStatus(active: active, missing: missing)
    }
    static func label(_ key: String) -> String { labels[key] ?? key }

    public static func == (a: StartupStatus, b: StartupStatus) -> Bool {
        a.active == b.active && a.missing.map(\.name) == b.missing.map(\.name) && a.missing.map(\.reason) == b.missing.map(\.reason)
    }
}
