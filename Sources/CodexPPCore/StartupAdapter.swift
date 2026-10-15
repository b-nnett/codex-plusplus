import Foundation
import JavaScriptCore

/// Startup fast path for the renderer: cache-first Statsig gating and a
/// deferred dictation-cue preload. Optional by design: each edit applies only
/// when its code shape matches exactly once, and an unrecognised build starts
/// exactly as it does unpatched instead of blocking the patch. Discovery that
/// fails to run (a timeout or a parser crash) is not a mismatch: it throws a
/// `Failure`, and a patch never installs without the speed-ups it would match.
public enum StartupAdapter {
    public struct Result: Sendable {
        public let replacements: [(String, Data)]
        public let applied: [String: String]
        public let skipped: [String: String]
        /// Seconds the discovery took, recorded in the report.
        public let duration: TimeInterval
    }
    /// Discovery did not run to completion, so nothing is known about which edits match.
    public struct Failure: LocalizedError {
        public let reason: String
        public var errorDescription: String? { reason }
    }
    /// Runs the adapter on its input within a deadline: the app's signed Node
    /// runtime, or JavaScriptCore without it. Replaced in tests.
    typealias Runner = (_ input: [String: Any], _ archive: AsarArchive, _ timeout: TimeInterval) throws -> Output
    /// The first deadline fits an idle machine (about 12 s); the retry allows
    /// for a busy one.
    static let deadlines: [TimeInterval] = [60, 180]
    /// The adapter's result: which edits applied or were skipped, and the
    /// rewritten source for each input chunk it changed, by chunk key.
    struct Output: Decodable {
        let applied: [String: String]
        let skipped: [String: String]
        let css: [String: String]?
        let chunks: [String: String]
        private struct Key: CodingKey {
            let stringValue: String
            init(stringValue: String) { self.stringValue = stringValue }
            var intValue: Int? { nil }
            init?(intValue: Int) { nil }
        }
        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: Key.self)
            applied = try container.decode([String: String].self, forKey: Key(stringValue: "applied"))
            skipped = try container.decode([String: String].self, forKey: Key(stringValue: "skipped"))
            css = try container.decodeIfPresent([String: String].self, forKey: Key(stringValue: "css"))
            var chunks: [String: String] = [:]
            for key in container.allKeys where !["applied", "skipped", "css"].contains(key.stringValue) {
                if let text = try? container.decode(String.self, forKey: key) { chunks[key.stringValue] = text }
            }
            self.chunks = chunks
        }
        subscript(_ key: String) -> String? { chunks[key] }
        var shared: String? { chunks["shared"] }
        var initial: String? { chunks["initial"] }
    }

    /// The vendor chunks the edits target. Each resolves to the single `.js`
    /// file in its directory whose name starts with the prefix and whose source
    /// contains every marker; without markers the prefix alone must be unique.
    static let coreChunks: [StartupChunk] = [
        StartupChunk("shared", prefix: "app-shared-"),
        StartupChunk("initial", prefix: "app-initial-"),
        StartupChunk("requirements", in: ".vite/build", prefix: "startup-requirements-"),
        StartupChunk("main", in: ".vite/build", prefix: "main-"),
        // The app-server websocket transport (its keep-alive ping).
        StartupChunk("network", in: ".vite/build", prefix: "application-network-startup-"),
        // The Remote Connections settings page (its refresh poll).
        StartupChunk("remoteSettings", prefix: "remote-connections-settings-"),
        // The app-server connection and remote-control websocket.
        StartupChunk("appServer", in: ".vite/build", prefix: "src-", containing: ["(`AppServerConnection`)"]),
        // The composer (its catch-up prediction query).
        StartupChunk("primary", prefix: "app-primary-"),
        // The ambient suggestions generator; when it is the app-server chunk
        // its edits are made through that input (see `aliases`).
        StartupChunk("ambient", in: ".vite/build", prefix: "src-", containing: ["ambientSuggestionsModel", "first-plugin-connect"]),
        // The background-command output terminal and the integrated terminal.
        StartupChunk("xtermOutput", prefix: "xterm-output-panel-"),
        StartupChunk("terminalPanel", prefix: "terminal-panel-", containing: ["TerminalPanel", "ResizeObserver"]),
        // The checkout webview hosts.
        StartupChunk("checkout", prefix: "webview-page-", containing: ["CheckoutPricingWebviewHost"]),
        // Empty Trash in a Space, and a Space's icon and colour picker.
        StartupChunk("trash", prefix: "space-trash-items-", containing: ["`/pages/archived`"]),
        StartupChunk("appearance", prefix: "space-appearance-button-", containing: ["/spaces/v2/{space_id}/appearance"]),
    ]
    /// Every chunk, including those the edit lanes add (StartupLanes/*.swift).
    static var chunks: [StartupChunk] { coreChunks + streamingChunks + turnsChunks + gpuChunks + usageChunks + switchdataChunks + switchrenderChunks + hygieneChunks + pluginChunks }

    /// Discovery for a patch: a failed run is retried once with a longer
    /// deadline, then fails the patch so the installed app stays as it is.
    static func discoverForPatch(archive: AsarArchive, replacements: [(String, Data)], deadlines: [TimeInterval] = deadlines,
                                 onRetry: (Failure) -> Void = { _ in }, runner: Runner = adapt) throws -> Result {
        try diagnoseForPatch(archive: archive, replacements: replacements, deadlines: deadlines, onRetry: onRetry, runner: runner).result
    }

    /// `discoverForPatch`, keeping the chunk resolution (the patch pipeline and build reviews).
    static func diagnoseForPatch(archive: AsarArchive, replacements: [(String, Data)], deadlines: [TimeInterval] = deadlines,
                                 onRetry: (Failure) -> Void = { _ in }, runner: Runner = adapt) throws -> Diagnosis {
        try retrying(deadlines: deadlines, onRetry: onRetry) { try diagnose(archive: archive, replacements: replacements, timeout: $0, runner: runner) }
    }

    static func retrying<T>(deadlines: [TimeInterval], onRetry: (Failure) -> Void, _ attempt: (TimeInterval) throws -> T) throws -> T {
        var failure = Failure(reason: "Startup discovery did not run.")
        for (index, deadline) in deadlines.enumerated() {
            if index > 0 { onRetry(failure) }
            do { return try attempt(deadline) }
            catch let error as Failure { failure = error }
        }
        throw PatchError.invalid("Startup discovery failed (\(failure.reason)). ChatGPT was left as it was; retry the patch when the Mac is less busy.")
    }

    /// Edits that do not match are listed in `skipped`; a discovery that does
    /// not complete throws `Failure`.
    public static func discover(archive: AsarArchive, replacements: [(String, Data)], timeout: TimeInterval = 60) throws -> Result {
        try discover(archive: archive, replacements: replacements, timeout: timeout, runner: adapt)
    }

    static func discover(archive: AsarArchive, replacements: [(String, Data)], timeout: TimeInterval, runner: Runner) throws -> Result {
        try diagnose(archive: archive, replacements: replacements, timeout: timeout, runner: runner).result
    }

    /// How one chunk resolved, for reviewing a new build: how many files had
    /// the prefix, how many of those had every marker, and where it landed.
    public struct ChunkResolution: Codable, Sendable {
        public let key: String
        public let directory: String
        public let prefix: String
        public let markers: [String]
        public let prefixMatches: Int
        /// Files with the prefix that contain every marker (nil without markers).
        public let markerMatches: Int?
        public let path: String?
        /// The input that already owns the same file, when this chunk is an alias.
        public let aliasOf: String?
    }
    /// The discovery result together with how every chunk resolved.
    public struct Diagnosis: Sendable {
        public let result: Result
        public let chunks: [ChunkResolution]
        public let entry: String?
    }

    /// `discover`, keeping the chunk resolution (build reviews).
    public static func diagnose(archive: AsarArchive, replacements: [(String, Data)], timeout: TimeInterval = 60) throws -> Diagnosis {
        try diagnose(archive: archive, replacements: replacements, timeout: timeout, runner: adapt)
    }

    static func diagnose(archive: AsarArchive, replacements: [(String, Data)], timeout: TimeInterval, runner: Runner) throws -> Diagnosis {
        let started = Date()
        do {
            try PatchAdapter.approveArchive(archive)
            func source(at path: String) throws -> String? {
                let data = try replacements.first(where: { $0.0 == path })?.1 ?? archive.data(at: path)
                guard data.count <= 32 * 1024 * 1024 else { return nil }
                return String(data: data, encoding: .utf8)
            }
            func resolve(_ chunk: StartupChunk) throws -> (found: (String, String)?, prefixMatches: Int, markerMatches: Int?) {
                let paths = try archive.packedFiles(in: chunk.directory).filter {
                    let name = URL(fileURLWithPath: $0).lastPathComponent
                    return name.hasPrefix(chunk.prefix) && name.hasSuffix(".js")
                }
                if chunk.markers.isEmpty {
                    guard paths.count == 1, let text = try source(at: paths[0]) else { return (nil, paths.count, nil) }
                    return ((paths[0], text), 1, nil)
                }
                let matches = try paths.compactMap { path -> (String, String)? in
                    guard let text = try source(at: path), chunk.markers.allSatisfy(text.contains) else { return nil }
                    return (path, text)
                }
                return (matches.count == 1 ? matches[0] : nil, paths.count, matches.count)
            }
            // Each archive path is one input; a later chunk that resolves to the
            // same file becomes an alias, so all its edits compose in one source.
            var resolved: [String: (String, String)] = [:], aliases: [String: String] = [:]
            var resolutions: [ChunkResolution] = []
            for chunk in chunks where resolved[chunk.key] == nil && aliases[chunk.key] == nil {
                let attempt = try resolve(chunk)
                var owner: String?
                if let found = attempt.found {
                    owner = resolved.first(where: { $0.value.0 == found.0 })?.key
                    if let owner { aliases[chunk.key] = owner } else { resolved[chunk.key] = found }
                }
                resolutions.append(ChunkResolution(key: chunk.key, directory: chunk.directory, prefix: chunk.prefix, markers: chunk.markers,
                    prefixMatches: attempt.prefixMatches, markerMatches: attempt.markerMatches, path: attempt.found?.0, aliasOf: owner))
            }
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
            var input: [String: Any] = ["diagnostics": PatchAdapter.experimentsEnabled, "aliases": aliases]
            for (key, chunk) in resolved { input[key] = chunk.1 }
            // The xterm WebGL renderer addon, inlined into the terminal panel.
            if resolved["terminalPanel"] != nil, let url = Bundle.module.url(forResource: "xterm-addon-webgl", withExtension: "js"),
               let addon = try? String(contentsOf: url, encoding: .utf8) { input["webglAddon"] = addon }
            if let html, let entry { input["html"] = html; input["entry"] = entry.1 }
            // Every stylesheet, for the viewport container-query rewrite.
            var stylesheets: [String: String] = [:]
            for path in try archive.packedFiles(in: "webview/assets") where path.hasSuffix(".css") {
                let data = try replacements.first(where: { $0.0 == path })?.1 ?? archive.data(at: path)
                if data.count <= 8 * 1024 * 1024, let text = String(data: data, encoding: .utf8) { stylesheets[path] = text }
            }
            input["css"] = stylesheets
            let output = try runner(input, archive, timeout)
            var result: [(String, Data)] = []
            if let source = output["html"] { result.append((htmlPath, Data(source.utf8))) }
            for (key, chunk) in resolved.sorted(by: { $0.key < $1.key }) {
                if let source = output[key] { result.append((chunk.0, Data(source.utf8))) }
            }
            for (path, source) in output.css ?? [:] where stylesheets[path] != nil { result.append((path, Data(source.utf8))) }
            return Diagnosis(result: Result(replacements: result, applied: output.applied, skipped: output.skipped, duration: Date().timeIntervalSince(started)),
                             chunks: resolutions, entry: entry?.0)
        } catch let error as Failure {
            throw error
        } catch {
            throw Failure(reason: error.localizedDescription)
        }
    }

    static func adapt(input: [String: Any], archive: AsarArchive, timeout: TimeInterval) throws -> Output {
        if let output = try JavaScriptDiscovery.run(archive: archive, adapter: "startup", input: input, timeout: timeout) {
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
    /// Seconds discovery took; absent in older reports.
    let duration: Double?
    init(applied: [String: String], skipped: [String: String], duration: Double? = nil) {
        self.applied = applied; self.skipped = skipped; self.duration = duration
    }
}

/// Which startup speed-ups matched the installed ChatGPT build, read from the
/// discovery report written at patch time. Diagnostic edits are not counted.
public struct StartupStatus: Equatable, Sendable {
    public static let reportPath = "Contents/Resources/codexpp-startup-discovery.json"
    static let diagnostics: Set<String> = ["appGateReasons", "chunkTimings", "loadingGateTimings", "opaqueSurfaceExperiment", "policyPhaseTimings", "queryTimings"]
    static var labels: [String: String] { coreLabels.merging(streamingLabels) { a, _ in a }.merging(turnsLabels) { a, _ in a }.merging(gpuLabels) { a, _ in a }.merging(usageLabels) { a, _ in a }.merging(switchdataLabels) { a, _ in a }.merging(switchrenderLabels) { a, _ in a }.merging(hygieneLabels) { a, _ in a }.merging(pluginLabels) { a, _ in a } }
    static let coreLabels: [String: String] = [
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
    /// Why none of the speed-ups are known to be applied: the installed patch
    /// has no readable discovery report (discovery did not complete when it
    /// was made). Repatching fixes it.
    public let failure: String?

    init(active: [String], missing: [(name: String, reason: String)], failure: String? = nil) {
        self.active = active; self.missing = missing; self.failure = failure
    }

    /// The status of a patched app, whose discovery report is written at patch time.
    public static func read(app: URL) -> StartupStatus {
        guard let data = try? Data(contentsOf: app.appendingPathComponent(reportPath)) else {
            return StartupStatus(active: [], missing: [], failure: "This patch has no startup discovery report: discovery did not complete when ChatGPT was patched.")
        }
        guard let report = try? JSONDecoder().decode(StartupDiscoveryReport.self, from: data) else {
            return StartupStatus(active: [], missing: [], failure: "This patch's startup discovery report is unreadable.")
        }
        let active = report.applied.keys.filter { !diagnostics.contains($0) }.map(label).sorted()
        let missing = report.skipped.filter { !diagnostics.contains($0.key) }.map { (name: label($0.key), reason: $0.value) }.sorted { $0.name < $1.name }
        return StartupStatus(active: active, missing: missing)
    }
    static func label(_ key: String) -> String { labels[key] ?? key }

    public static func == (a: StartupStatus, b: StartupStatus) -> Bool {
        a.active == b.active && a.missing.map(\.name) == b.missing.map(\.name) && a.missing.map(\.reason) == b.missing.map(\.reason) && a.failure == b.failure
    }
}
