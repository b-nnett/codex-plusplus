import Foundation

/// The structural renderer adapters, in patch order, each building on the
/// sources the earlier ones produced. Patching (`AppPatcher.stage`) stops at
/// the first required adapter that fails; a build review (`BuildReview`)
/// records every step and carries on, so both always run the same discovery.
struct RendererPipeline {
    struct Step {
        let adapter: String
        /// A required adapter that fails blocks the patch; an optional one is left out.
        let required: Bool
        let seconds: Double
        let error: String?
        /// Why each earlier attempt failed, when the step was retried (startup).
        var retries: [String] = []
    }
    struct Output {
        /// Every rewritten archive file, by path, in the order they were produced.
        var renderers: [(String, Data)] = []
        var settings: NativeSettingsAdapter.Discovery?
        var settingsPaths: [String] = []
        var shellPath: String?
        var bookmarkPaths: [String] = []
        var sidebar: SidebarAdapter.Result?
        var browserPath: String?
        var startup: StartupAdapter.Diagnosis?
        var steps: [Step] = []
    }
    /// Keep going after a required adapter fails (build reviews only).
    var continuesAfterFailure = false

    func run(archive original: AsarArchive, settingsRuntime runtime: String, onRetry: (String) -> Void = { _ in }) throws -> Output {
        var output = Output()
        var retries: [String] = []
        func step<T>(_ name: String, required: Bool, _ body: () throws -> T) throws -> T? {
            let start = DispatchTime.now().uptimeNanoseconds
            func record(_ error: Error?) {
                let seconds = Double(DispatchTime.now().uptimeNanoseconds - start) / 1e9
                output.steps.append(Step(adapter: name, required: required, seconds: seconds, error: error?.localizedDescription, retries: retries))
                retries = []
            }
            do { let value = try body(); record(nil); return value }
            catch { record(error); if required && !continuesAfterFailure { throw error }; return nil }
        }
        let discovery = try step("settings", required: true) { try NativeSettingsAdapter.discover(archive: original, runtime: runtime) }
        output.settings = discovery?.report
        let settingsPatches = discovery?.patches ?? []
        output.settingsPaths = settingsPatches.map(\.0)
        var base = settingsPatches
        if let shell = try step("shell", required: true, { try ShellAdapter.discover(archive: original, replacements: settingsPatches) }) {
            output.shellPath = shell.0
            base = settingsPatches.filter({ $0.0 != shell.0 }) + [shell]
        }
        var renderers = base
        if let bookmarks = try step("bookmarks", required: true, { try BookmarksAdapter.discover(archive: original, replacements: base) }) {
            let paths = Set(bookmarks.map { $0.0 })
            output.bookmarkPaths = bookmarks.map(\.0)
            renderers = base.filter({ !paths.contains($0.0) }) + bookmarks
        }
        // Optional: a sidebar contract mismatch leaves better-sidebar to
        // report its missing capabilities; it never blocks the patch.
        if let sidebar = try step("sidebar", required: false, { try SidebarAdapter.diagnose(archive: original, replacements: renderers) }) {
            output.sidebar = sidebar
            renderers = renderers.filter({ $0.0 != sidebar.path }) + [(sidebar.path, sidebar.source)]
        }
        // The startup fast path also edits the main bundle, so it builds
        // on the browser adapter's output rather than replacing it.
        if let browser = try step("browser", required: true, { try NativeBrowserAdapter.patch(archive: original) }) {
            output.browserPath = browser.0
            renderers = renderers.filter({ $0.0 != browser.0 }) + [browser]
        }
        // Startup fast path: unmatched code stays unpatched, but a discovery
        // that cannot finish even when retried with a longer deadline (a busy
        // machine) fails the patch rather than installing it without speed-ups.
        if let startup = try step("startup", required: true, {
            try StartupAdapter.diagnoseForPatch(archive: original, replacements: renderers, onRetry: { failure in retries.append(failure.reason); onRetry(failure.reason) })
        }) {
            output.startup = startup
            let paths = Set(startup.result.replacements.map { $0.0 })
            renderers = renderers.filter({ !paths.contains($0.0) }) + startup.result.replacements
        }
        output.renderers = renderers
        return output
    }
}
