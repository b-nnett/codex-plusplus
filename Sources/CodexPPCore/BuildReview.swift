import Foundation

/// A read-only review of a ChatGPT build: its identity, whether its native
/// contracts still hold, and what every adapter's discovery would do with it.
/// It runs the patch's own `RendererPipeline` against the original vendor
/// archive, so it cannot drift from what patching does. Nothing is written.
/// `scripts/review-build.py` formats the result (CodexPP --review-build).
public enum BuildReview {
    /// The unpatched vendor bundle behind `app`: the original backup a patch
    /// receipt records, verified against the receipt, or the app itself.
    public static func original(of app: URL) throws -> (url: URL, receipt: PatchReceipt?) {
        let receiptURL = app.appendingPathComponent("Contents/Resources/codexpp-patch.json")
        guard FileManager.default.fileExists(atPath: receiptURL.path) else { return (app, nil) }
        let receipt = try JSONDecoder().decode(PatchReceipt.self, from: Data(contentsOf: receiptURL))
        let backup = URL(fileURLWithPath: receipt.backupPath)
        guard FileManager.default.fileExists(atPath: backup.appendingPathComponent("Contents/Resources/app.asar").path) else {
            throw PatchError.invalid("\(app.path) is patched and its original backup \(backup.path) is missing; review the original instead.")
        }
        guard !FileManager.default.fileExists(atPath: backup.appendingPathComponent("Contents/Resources/codexpp-patch.json").path),
              try fileSHA256(backup.appendingPathComponent("Contents/Resources/app.asar")) == receipt.originalArchiveHash else {
            throw PatchError.invalid("The original backup \(backup.path) does not match the patch receipt.")
        }
        return (backup, receipt)
    }

    /// The review as a JSON object (see docs/reviewing-a-new-build.md).
    public static func run(app requested: URL, settingsRuntime: String) throws -> [String: Any] {
        let started = DispatchTime.now().uptimeNanoseconds
        func elapsed(since start: UInt64) -> Double { Double(DispatchTime.now().uptimeNanoseconds - start) / 1e9 }
        let (app, receipt) = try original(of: requested)
        let info = try PropertyListSerialization.propertyList(from: Data(contentsOf: app.appendingPathComponent("Contents/Info.plist")), format: nil) as? [String: Any] ?? [:]
        let version = info["CFBundleShortVersionString"] as? String ?? "", build = info["CFBundleVersion"] as? String ?? ""
        let archiveURL = app.appendingPathComponent("Contents/Resources/app.asar")
        let archive = try AsarArchive(archiveURL)
        if let receipt, receipt.build != build { throw PatchError.invalid("The receipt's build \(receipt.build) does not match the original backup's \(build).") }

        // Identity: a pinned build is one this helper's adapter table lists;
        // anything else must authenticate as OpenAI's and pass the bundle contract.
        let pinned = PatchAdapter.reviewed.first { $0.headerHash == archive.headerHash && $0.build == build && $0.version == version }
        var authenticationError: String?
        do { try VendorUpdateAdapter.authenticate(app) } catch { authenticationError = error.localizedDescription }
        var adapter: PatchAdapter? = pinned, adapterError: String?
        if adapter == nil {
            do { adapter = try VendorUpdateAdapter.discover(app, info: info) } catch { adapterError = error.localizedDescription }
        }
        var identity: [String: Any] = [
            "version": version, "build": build, "bundleIdentifier": info["CFBundleIdentifier"] as? String ?? "",
            "headerHash": archive.headerHash, "archiveSHA256": try fileSHA256(archiveURL),
            "pinned": pinned != nil, "vendorAuthenticated": authenticationError == nil,
            "status": pinned != nil ? "pinned" : authenticationError == nil && adapter != nil ? "vendor-authenticated" : "unsupported",
            "pinnedBuilds": PatchAdapter.reviewed.map { ["build": $0.build, "version": $0.version, "headerHash": $0.headerHash] },
        ]
        if let authenticationError { identity["authenticationError"] = authenticationError }
        if let adapter { identity["adapter"] = adapter.id }
        if let adapterError { identity["adapterError"] = adapterError }

        // Native contracts the patch edits outside the archive.
        var native: [[String: Any]] = []
        func check(_ name: String, _ body: () throws -> String) {
            do { native.append(["name": name, "status": "applied", "target": try body()]) }
            catch { native.append(["name": name, "status": "skipped", "reason": error.localizedDescription]) }
        }
        check("bootstrapEntry") {
            guard let adapter else { throw PatchError.invalid(adapterError ?? "No adapter for this build.") }
            _ = try adapter.validate(version: version, build: build, archive: archive)
            return adapter.main
        }
        check("asarIntegritySlot") {
            guard let adapter, let path = adapter.frameworkPath, let offset = adapter.integrityOffset,
                  let integrity = info["ElectronAsarIntegrity"] as? [String: Any] else { throw PatchError.invalid(adapterError ?? "No framework integrity contract.") }
            let bytes = try Data(contentsOf: app.appendingPathComponent(path), options: .mappedIfSafe)
            guard sha256(bytes) == adapter.frameworkHash else { throw PatchError.invalid("The framework is not the reviewed binary.") }
            let expected = try NativeIntegrityDigest.dictionaryHash(integrity)
            try NativeIntegrityDigest.validate(bytes, offset: offset, expected: expected, replacement: expected)
            return "\(path) @ \(offset)"
        }
        check("launcherStartupPolicy") {
            guard let adapter, let path = adapter.frameworkPath, let executable = info["CFBundleExecutable"] as? String, !executable.contains("/") else {
                throw PatchError.invalid(adapterError ?? "No launcher contract.")
            }
            _ = try StartupPolicyAdapter.patch(Data(contentsOf: app.appendingPathComponent("Contents/MacOS/" + executable)), frameworkPath: path)
            return "Contents/MacOS/" + executable
        }

        // Every renderer adapter, in patch order, carrying on past failures.
        let pipeline = try RendererPipeline(continuesAfterFailure: true).run(archive: archive, settingsRuntime: settingsRuntime)
        // A chunk's name without its content hash (12 hex digits in the
        // webview, 8 base64url characters in .vite/build), stable across builds.
        func family(_ path: String) -> String {
            let name = URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
            return name.wholeMatch(of: /(.+?)-(?:[0-9a-f]{12}|[A-Za-z0-9_\-]{8})/).map { String($0.1) } ?? name
        }
        var adapters: [[String: Any]] = []
        for step in pipeline.steps {
            var entry: [String: Any] = ["name": step.adapter, "required": step.required, "seconds": step.seconds, "status": step.error == nil ? "ok" : "failed"]
            if let error = step.error { entry["error"] = error }
            if !step.retries.isEmpty { entry["retries"] = step.retries }
            var edits: [[String: Any]] = []
            switch step.adapter {
            case "settings":
                if let report = pipeline.settings {
                    edits.append(["name": "page", "status": "applied", "target": "\(report.page.path) (\(report.page.binding))"])
                    for (name, binding) in report.components.sorted(by: { $0.key < $1.key }) {
                        edits.append(["name": "component." + name, "status": "applied", "target": "\(binding.path) (\(binding.binding))"])
                    }
                    for (name, binding) in report.hooks.sorted(by: { $0.key < $1.key }) {
                        edits.append(["name": "hook." + name, "status": "applied", "target": binding])
                    }
                }
                entry["files"] = pipeline.settingsPaths
            case "shell":
                if let path = pipeline.shellPath { edits.append(["name": "shellFrame", "status": "applied", "target": path]) }
            case "bookmarks":
                for path in pipeline.bookmarkPaths { edits.append(["name": family(path), "status": "applied", "target": path]) }
            case "sidebar":
                if let sidebar = pipeline.sidebar {
                    for (name, evidence) in sidebar.report.sorted(by: { $0.key < $1.key }) {
                        var edit: [String: Any] = ["name": name, "status": "applied", "target": evidence.path ?? sidebar.path, "why": evidence.why]
                        if let local = evidence.local { edit["local"] = local }
                        edits.append(edit)
                    }
                    for name in sidebar.missing.sorted() where sidebar.report[name] == nil {
                        edits.append(["name": name, "status": "skipped", "reason": "capability not found"])
                    }
                }
            case "browser":
                if let path = pipeline.browserPath {
                    edits.append(["name": "nativeBrowserMenu", "status": "applied", "target": path])
                    edits.append(["name": "appToolsLaunchConfig", "status": "applied", "target": path])
                }
            case "startup":
                if let startup = pipeline.startup {
                    for (name, chunk) in startup.result.applied.sorted(by: { $0.key < $1.key }) {
                        edits.append(["name": name, "status": "applied", "target": chunk, "label": StartupStatus.label(name), "release": !StartupStatus.diagnostics.contains(name)])
                    }
                    for (name, reason) in startup.result.skipped.sorted(by: { $0.key < $1.key }) {
                        edits.append(["name": name, "status": "skipped", "reason": reason, "label": StartupStatus.label(name), "release": !StartupStatus.diagnostics.contains(name)])
                    }
                    entry["chunks"] = startup.chunks.map { chunk -> [String: Any] in
                        var row: [String: Any] = ["key": chunk.key, "directory": chunk.directory, "prefix": chunk.prefix, "markers": chunk.markers, "prefixMatches": chunk.prefixMatches]
                        if let count = chunk.markerMatches { row["markerMatches"] = count }
                        if let path = chunk.path { row["path"] = path }
                        if let owner = chunk.aliasOf { row["aliasOf"] = owner }
                        return row
                    }
                    if let entryPath = startup.entry { entry["entry"] = entryPath }
                    // The adapter's own measure, as the patch's discovery report records it.
                    entry["duration"] = startup.result.duration
                }
            default: break
            }
            entry["edits"] = edits
            adapters.append(entry)
        }
        var appInfo: [String: Any] = ["requested": requested.path, "original": app.path]
        if let receipt { appInfo["receiptAdapter"] = receipt.adapter }
        return [
            "schema": 1,
            "generatedAt": ISO8601DateFormatter().string(from: Date()),
            "tool": ["patchRevision": PatchAdapter.revision, "experiments": PatchAdapter.experimentsEnabled, "discoveryDeadlines": StartupAdapter.deadlines],
            "app": appInfo,
            "identity": identity,
            "native": native,
            "adapters": adapters,
            "seconds": elapsed(since: started),
        ]
    }
}
