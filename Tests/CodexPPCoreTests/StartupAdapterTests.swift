import XCTest
@testable import CodexPPCore

final class StartupAdapterTests: XCTestCase {
    private let shared = "export function r(e,r){let i=e(r),[a,o]=[!0,()=>{}];(()=>{i.loadingStatus!==`Ready`&&i.initializeAsync().catch(t.Log.error).finally(()=>o(!1))})();return{client:i,isLoading:a}}"
    private let initial = "export function P(S,b,E,bQs){let e=!1;try{S.updateUserAsync(b).then(bQs).finally(()=>{e||E(b)})}catch(e){}return `CodexStatsigProvider.async`};" +
        "function Qpl(){let e=new AudioContext({latencyHint:`interactive`});return e.decodeAudioData}" +
        "export function rml(){typeof window<`u`&&window.setTimeout(()=>{try{Qpl()}catch{}},0)}" +
        "export function uj(e){let t=1,{variant:a,debugName:o,startupIndicator:s}=e,[f,p]=(0,R.useState)(!1);return o}"

    /// The JavaScriptCore fallback must agree with the Node adapter.
    func testInProcessFallbackAppliesAllFourEdits() throws {
        // As in release builds: diagnostic edits are skipped.
        let output = try StartupAdapter.adaptInProcess(input: ["shared": shared, "initial": initial])
        XCTAssertEqual(output.skipped["loadingGateTimings"], "development builds only")
        XCTAssertEqual(output.applied, ["statsigCacheFirst": "shared", "statsigUserCacheFirst": "initial", "deferDictationCues": "initial", "caretBlinkTimeout": "initial", "compositorShimmer": "initial"])
        XCTAssertEqual(output.skipped.keys.sorted(), ["ambientSuggestionsLowEffort", "ambientSuggestionsOnDemand", "appGateReasons", "authStorageGateCacheFirst", "batchedPtyOutput", "cachedAutoHighlightLanguage", "capIdlePageSessions", "catchUpPredictionWhenShown", "childPagesPollOnSpaceRoute", "chunkTimings", "coalesceBrowserMenuRefresh", "coalescedTerminalResize", "deferDockIcon", "gitStateWhenChanged", "lazyAvatarOverlayPrewarm", "lazyCheckoutCreditPrewarm", "lazyCheckoutPricingPrewarm", "lazyDetachedWindowPrewarm", "lazyHotkeyWindowPrewarm", "lazyPageWindowPrewarm", "learnedStartupPreload", "loadingGateTimings", "opaqueSurfaceExperiment", "plainSettledWords", "policyPhaseTimings", "pubsubReconnectCap", "queryTimings", "queuedAppearanceChange", "quietSidebarRebind", "remoteControlBackoff", "remoteSettingsPollWhenVisible", "resumeVisibleThreadFirst", "settingsCacheFirst", "shellResizeSync", "skipHiddenThreadRefetch", "startupRevealUnthrottled", "statsigBootstrapCacheFirst", "stderrNotConnectionError", "terminalOutputAppend", "trashPaginationGuard", "viewportContainerQueries", "wakeAwarePongTimeout"])
        XCTAssertTrue(output.shared?.contains("values_updated") == true)
        XCTAssertFalse(output.initial?.contains("window.setTimeout(()=>{try{Qpl()}") ?? true)
        XCTAssertThrowsError(try StartupAdapter.adaptInProcess(input: ["shared": output.shared!, "initial": initial]))
    }

    func testUnrecognisedModulesAreLeftUntouched() throws {
        let output = try StartupAdapter.adaptInProcess(input: ["shared": "export const x=1;", "initial": "export const y=2;"])
        XCTAssertTrue(output.applied.isEmpty)
        XCTAssertNil(output.shared)
        XCTAssertNil(output.initial)
        XCTAssertEqual(output.skipped["statsigCacheFirst"], "expected one match, found 0")
    }

    func testStartupStatusCountsSpeedupsAndListsMisses() throws {
        let app = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: app) }
        XCTAssertNil(StartupStatus.read(app: app))
        let report = app.appendingPathComponent(StartupStatus.reportPath)
        try FileManager.default.createDirectory(at: report.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(StartupDiscoveryReport(applied: ["deferDockIcon": "main", "queryTimings": "shared"],
                                                        skipped: ["settingsCacheFirst": "expected one match, found 0", "chunkTimings": "module not found"])).write(to: report)
        let status = try XCTUnwrap(StartupStatus.read(app: app))
        XCTAssertEqual(status.active, ["Deferred Dock icon"], "diagnostic edits are not counted")
        XCTAssertEqual(status.missing.map(\.name), ["Cached settings"])
        XCTAssertEqual(status.missing.first?.reason, "expected one match, found 0")
    }

    /// Against a real stock ChatGPT archive (CODEXPP_ORIGINAL_ASAR): every release
    /// speed-up must match exactly once, and only development-only edits may skip.
    func testEveryReleaseEditAppliesToTheReviewedArchive() throws {
        guard let path = ProcessInfo.processInfo.environment["CODEXPP_ORIGINAL_ASAR"] else {
            throw XCTSkip("Set CODEXPP_ORIGINAL_ASAR to the reviewed original app archive for the startup adapter check.")
        }
        let archive = try AsarArchive(URL(fileURLWithPath: path))
        let (browserPath, browserSource) = try NativeBrowserAdapter.patch(archive: archive)
        let result = try XCTUnwrap(StartupAdapter.discover(archive: archive, replacements: [(browserPath, browserSource)]), "discovery failed")
        let developmentOnly: Set<String> = ["queryTimings", "appGateReasons", "loadingGateTimings", "policyPhaseTimings", "opaqueSurfaceExperiment"]
        XCTAssertEqual(Set(result.skipped.keys), PatchAdapter.experimentsEnabled ? [] : developmentOnly, "\(result.skipped)")
        for name in StartupStatus.labels.keys where !developmentOnly.contains(name) { XCTAssertNotNil(result.applied[name], name) }
        for (path, data) in result.replacements where path.hasSuffix(".js") {
            let script = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mjs")
            try data.write(to: script); defer { try? FileManager.default.removeItem(at: script) }
            let process = Process(); process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = ["node", "--check", script.path]; process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
            try process.run(); process.waitUntilExit()
            XCTAssertEqual(process.terminationStatus, 0, "\(path) does not parse")
        }
    }
}
