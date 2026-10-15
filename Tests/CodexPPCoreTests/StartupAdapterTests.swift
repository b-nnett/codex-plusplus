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
        // The others are skipped because their chunk or code is not in this fixture, never for breaking it.
        XCTAssertFalse(output.skipped.values.contains { $0.contains("did not parse") || $0.contains("overlaps another edit") || $0.contains("already exists") }, "\(output.skipped)")
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
        let report = app.appendingPathComponent(StartupStatus.reportPath)
        try FileManager.default.createDirectory(at: report.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(StartupDiscoveryReport(applied: ["deferDockIcon": "main", "queryTimings": "shared"],
                                                        skipped: ["settingsCacheFirst": "expected one match, found 0", "chunkTimings": "module not found"])).write(to: report)
        let status = try XCTUnwrap(StartupStatus.read(app: app))
        XCTAssertEqual(status.active, ["Deferred Dock icon"], "diagnostic edits are not counted")
        XCTAssertEqual(status.missing.map(\.name), ["Cached settings"])
        XCTAssertEqual(status.missing.first?.reason, "expected one match, found 0")
        XCTAssertNil(status.failure)
    }

    /// A patched app without a report never ran discovery to completion; the
    /// menu shows that as a failure, not as an app with no speed-ups to apply.
    func testStartupStatusReportsAMissingOrUnreadableReportAsAFailure() throws {
        let app = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: app) }
        let missing = StartupStatus.read(app: app)
        XCTAssertTrue(missing.active.isEmpty)
        XCTAssertTrue(missing.failure?.contains("no startup discovery report") == true, "\(missing)")
        let report = app.appendingPathComponent(StartupStatus.reportPath)
        try FileManager.default.createDirectory(at: report.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("{".utf8).write(to: report)
        XCTAssertNotNil(StartupStatus.read(app: app).failure)
        // A build where nothing matched is not a failure.
        try JSONEncoder().encode(StartupDiscoveryReport(applied: [:], skipped: ["settingsCacheFirst": "expected one match, found 0"], duration: 11.8)).write(to: report)
        let unmatched = StartupStatus.read(app: app)
        XCTAssertNil(unmatched.failure)
        XCTAssertEqual(unmatched.missing.map(\.name), ["Cached settings"])
    }

    func testReportRecordsDurationAndReadsOlderReportsWithoutIt() throws {
        let encoded = try JSONEncoder().encode(StartupDiscoveryReport(applied: ["deferDockIcon": "main"], skipped: [:], duration: 12.5))
        XCTAssertEqual(try JSONSerialization.jsonObject(with: encoded) as? NSDictionary, ["applied": ["deferDockIcon": "main"], "skipped": [:], "duration": 12.5] as NSDictionary)
        let older = try JSONDecoder().decode(StartupDiscoveryReport.self, from: Data(#"{"applied":{},"skipped":{}}"#.utf8))
        XCTAssertNil(older.duration)
    }

    /// A discovery that cannot run throws instead of returning an empty result.
    func testDiscoveryThatCannotRunThrowsAFailure() throws {
        let (path, _, _) = try AsarPatchTests.fixture()
        defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        var ran = false
        XCTAssertThrowsError(try StartupAdapter.discover(archive: AsarArchive(path), replacements: [], timeout: 1, runner: { _, _, _ in ran = true; throw PatchError.invalid("unreachable") })) {
            XCTAssertTrue($0 is StartupAdapter.Failure, "\($0)")
        }
        XCTAssertFalse(ran, "an unauthenticated archive is never adapted")
    }

    private func result(_ applied: [String: String] = [:]) -> StartupAdapter.Result {
        StartupAdapter.Result(replacements: [], applied: applied, skipped: [:], duration: 1)
    }

    /// A timeout on a busy machine is retried once with the longer deadline.
    func testFailedDiscoveryIsRetriedWithALongerDeadline() throws {
        var deadlines: [TimeInterval] = [], retries: [String] = []
        let output = try StartupAdapter.retrying(deadlines: StartupAdapter.deadlines, onRetry: { retries.append($0.reason) }) { deadline in
            deadlines.append(deadline)
            if deadlines.count == 1 { throw StartupAdapter.Failure(reason: "Code discovery timed out after 60 s; the app was not patched.") }
            return result(["deferDockIcon": "main"])
        }
        XCTAssertEqual(deadlines, [60, 180])
        XCTAssertEqual(retries, ["Code discovery timed out after 60 s; the app was not patched."])
        XCTAssertEqual(output.applied, ["deferDockIcon": "main"])
    }

    /// A second failure fails the patch with the reason; nothing degraded is installed.
    func testRepeatedDiscoveryFailureFailsThePatch() {
        var attempts = 0
        XCTAssertThrowsError(try StartupAdapter.retrying(deadlines: StartupAdapter.deadlines, onRetry: { _ in }) { _ in
            attempts += 1; throw StartupAdapter.Failure(reason: "Code discovery failed: parser crashed")
        }) { error in
            XCTAssertTrue(error is PatchError)
            XCTAssertTrue(error.localizedDescription.contains("parser crashed"), error.localizedDescription)
            XCTAssertTrue(error.localizedDescription.contains("ChatGPT was left as it was"), error.localizedDescription)
        }
        XCTAssertEqual(attempts, 2)
    }

    /// No matches (an unrecognised build) is a result, not a failure: it is not retried.
    func testUnmatchedDiscoveryIsNotRetried() throws {
        var attempts = 0
        let output = try StartupAdapter.retrying(deadlines: StartupAdapter.deadlines, onRetry: { _ in XCTFail("retried") }) { _ in attempts += 1; return result() }
        XCTAssertEqual(attempts, 1)
        XCTAssertTrue(output.applied.isEmpty)
    }

    /// Against a real stock ChatGPT archive (CODEXPP_ORIGINAL_ASAR): every release
    /// speed-up must match exactly once, and only development-only edits may skip.
    func testEveryReleaseEditAppliesToTheReviewedArchive() throws {
        guard let path = ProcessInfo.processInfo.environment["CODEXPP_ORIGINAL_ASAR"] else {
            throw XCTSkip("Set CODEXPP_ORIGINAL_ASAR to the reviewed original app archive for the startup adapter check.")
        }
        let archive = try AsarArchive(URL(fileURLWithPath: path))
        let (browserPath, browserSource) = try NativeBrowserAdapter.patch(archive: archive)
        let started = Date()
        let result = try StartupAdapter.discover(archive: archive, replacements: [(browserPath, browserSource)])
        // Time budget: discovery must leave ample headroom under its 60 s
        // first deadline on a busy machine (it took 46 s before an optimisation).
        XCTAssertLessThan(Date().timeIntervalSince(started), 25, "startup discovery is too slow")
        XCTAssertLessThanOrEqual(result.duration, Date().timeIntervalSince(started))
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

    /// Against the real archive, a crashing runner is a failure while a runner
    /// that matches nothing still yields a (speed-up-free) result.
    func testRealArchiveDistinguishesRunnerFailureFromNoMatches() throws {
        guard let path = ProcessInfo.processInfo.environment["CODEXPP_ORIGINAL_ASAR"] else {
            throw XCTSkip("Set CODEXPP_ORIGINAL_ASAR to the reviewed original app archive for the startup adapter check.")
        }
        let archive = try AsarArchive(URL(fileURLWithPath: path))
        var timeouts: [TimeInterval] = []
        XCTAssertThrowsError(try StartupAdapter.discoverForPatch(archive: archive, replacements: [], runner: { _, _, timeout in
            timeouts.append(timeout); throw PatchError.invalid("Code discovery timed out after \(Int(timeout)) s; the app was not patched.")
        })) { XCTAssertTrue($0.localizedDescription.contains("timed out after 180 s"), $0.localizedDescription) }
        XCTAssertEqual(timeouts, [60, 180])
        let unmatched = try StartupAdapter.discoverForPatch(archive: archive, replacements: [], runner: { _, _, _ in
            try JSONDecoder().decode(StartupAdapter.Output.self, from: Data(#"{"applied":{},"skipped":{"statsigCacheFirst":"expected one match, found 0"}}"#.utf8))
        })
        XCTAssertTrue(unmatched.applied.isEmpty)
        XCTAssertTrue(unmatched.replacements.isEmpty)
    }
}
