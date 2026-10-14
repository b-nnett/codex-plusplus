import AppKit
import CodexPPCore

/// Keeps Codex++ current from its GitHub releases. A release is a signed
/// manifest plus a source tarball; this checks the manifest's signature
/// against the release key compiled into this helper, downloads and verifies
/// the tarball, builds it with the local toolchain and the pinned Developer ID
/// in a staging folder, and offers it once it is ready. Installing hands off
/// to the staged helper (`--finish-self-update`), which swaps the bundle in
/// place after this one quits and swaps back if the new one does not start.
@MainActor
final class SelfUpdater {
    enum State: Equatable {
        case idle
        case checking
        case upToDate
        case building(String)
        case ready(String)
        case failed(String)
    }
    private(set) var state: State = .idle { didSet { changed?() } }
    var changed: (() -> Void)?
    private let support: URL
    private var loop: Task<Void, Never>?
    private var running = false

    init(support: URL) { self.support = support }

    var updates: URL { support.appendingPathComponent("Updates") }
    var currentVersion: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0" }
    private var currentBuild: Int { Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1") ?? 1 }

    /// Checks 5 minutes after launch, then about once a day.
    func start(enabled: @escaping @MainActor () -> Bool) {
        guard loop == nil else { return }
        restoreReadyUpdate()
        loop = Task { [weak self] in
            try? await Task.sleep(for: .seconds(300))
            while !Task.isCancelled {
                if enabled() { await self?.check(userInitiated: false) }
                try? await Task.sleep(for: .seconds(86_400 + Double.random(in: -3_600...3_600)))
            }
        }
    }

    func checkNow() { Task { await check(userInitiated: true) } }

    private func check(userInitiated: Bool) async {
        guard !running else { return }
        if case .ready = state { return }
        running = true; defer { running = false }
        guard let signers = SelfUpdate.allowedSigners() else {
            state = userInitiated ? .failed("Updates are off: this build has no release signing key.") : .idle
            return
        }
        state = .checking
        do {
            let manifestData = try await download(SelfUpdate.latestManifestURL)
            let signature = try await download(SelfUpdate.latestSignatureURL)
            try SelfUpdate.verify(manifest: manifestData, signature: signature, allowedSigners: signers)
            guard let manifest = try SelfUpdate.accept(manifestData, currentVersion: currentVersion) else { state = .upToDate; return }
            try await build(manifest)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    private func download(_ url: URL) async throws -> Data {
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
        request.setValue("Codex++/\(currentVersion)", forHTTPHeaderField: "User-Agent")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw PatchError.invalid("GitHub returned an unexpected response for \(url.lastPathComponent).") }
        return data
    }

    private func build(_ manifest: ReleaseManifest) async throws {
        state = .building(manifest.version)
        let fm = FileManager.default
        guard let pin = LocalSigningIdentity.pinned(support: support) else { throw PatchError.invalid("Patch ChatGPT once before updating Codex++, so its signing identity is pinned.") }
        let directory = updates.appendingPathComponent(manifest.version)
        try? fm.removeItem(at: directory)
        try fm.createDirectory(at: directory, withIntermediateDirectories: true)
        let tarball = directory.appendingPathComponent(manifest.artifact)
        let (downloaded, response) = try await URLSession.shared.download(from: SelfUpdate.artifactURL(manifest))
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw PatchError.invalid("The release download failed.") }
        try fm.moveItem(at: downloaded, to: tarball)
        try SelfUpdate.verifyArtifact(tarball, manifest: manifest)
        let source = try SelfUpdate.extract(tarball, manifest: manifest, into: directory.appendingPathComponent("source"))
        let output = directory.appendingPathComponent("Codex++.app")
        var environment = ["PATH": "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin",
                           "HOME": fm.homeDirectoryForCurrentUser.path, "LANG": "en_US.UTF-8",
                           "CODEXPP_OUTPUT": output.path, "CODEXPP_SIGNING_IDENTITY": pin,
                           "CODEXPP_BUILD_NUMBER": String(currentBuild + 1),
                           "CODEXPP_SPARKLE_CACHE": updates.appendingPathComponent("sparkle-cache").path]
        if let developer = ProcessInfo.processInfo.environment["DEVELOPER_DIR"] { environment["DEVELOPER_DIR"] = developer }
        let log = directory.appendingPathComponent("build.log")
        let buildEnvironment = environment
        let status = try await Task.detached { () throws -> Int32 in
            FileManager.default.createFile(atPath: log.path, contents: nil)
            let handle = try FileHandle(forWritingTo: log)
            defer { try? handle.close() }
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/bash")
            process.arguments = ["scripts/build-app.sh"]
            process.currentDirectoryURL = source
            process.environment = buildEnvironment
            process.standardOutput = handle; process.standardError = handle
            try process.run(); process.waitUntilExit()
            return process.terminationStatus
        }.value
        guard status == 0 else { throw PatchError.invalid("Building Codex++ \(manifest.version) failed; see \(log.path).") }
        guard Bundle(url: output)?.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String == manifest.version else {
            throw PatchError.invalid("The built update has the wrong version.")
        }
        try LocalSigningIdentity.validate(helper: output, support: support)
        try JSONEncoder().encode(manifest).write(to: directory.appendingPathComponent("ready.json"), options: .atomic)
        try? fm.removeItem(at: directory.appendingPathComponent("source"))
        state = .ready(manifest.version)
    }

    /// A build that finished before the last quit is offered again.
    private func restoreReadyUpdate() {
        guard let versions = try? FileManager.default.contentsOfDirectory(atPath: updates.path) else { return }
        for version in versions.sorted(by: { SelfUpdate.compare($0, $1) == .orderedDescending })
        where SelfUpdate.compare(version, currentVersion) == .orderedDescending {
            let directory = updates.appendingPathComponent(version)
            guard FileManager.default.fileExists(atPath: directory.appendingPathComponent("ready.json").path),
                  (try? LocalSigningIdentity.validate(helper: directory.appendingPathComponent("Codex++.app"), support: support)) != nil else { continue }
            state = .ready(version); return
        }
    }

    /// Hands off to the staged helper, which swaps it in after this one quits.
    func install() throws {
        guard case .ready(let version) = state else { return }
        let staged = updates.appendingPathComponent(version).appendingPathComponent("Codex++.app")
        let ticket = SelfUpdateTicket(oldPID: ProcessInfo.processInfo.processIdentifier, installedPath: Bundle.main.bundleURL.path,
                                      stagedPath: staged.path, version: version, createdAt: Date())
        let file = updates.appendingPathComponent("self-update.json")
        try JSONEncoder().encode(ticket).write(to: file, options: .atomic)
        let process = Process()
        process.executableURL = staged.appendingPathComponent("Contents/MacOS/CodexPP")
        process.arguments = ["--finish-self-update", file.path]
        try process.run()
        NSApp.terminate(nil)
    }
}
