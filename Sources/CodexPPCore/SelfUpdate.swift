import Foundation
import CryptoKit

/// The signed description of a Codex++ source release (`release.json`).
public struct ReleaseManifest: Codable, Equatable, Sendable {
    public let schema: Int
    public let repo: String
    public let tag: String
    public let version: String
    public let commit: String
    public let artifact: String
    public let sha256: String
    public let size: Int
    public let patchRevision: Int
    public let distribution: String
}

/// Codex++ updates itself from GitHub releases of its own source. Every user
/// builds and signs Codex++ with their own Developer ID, so an update is a
/// source tarball, not a binary: its manifest must carry an SSH signature from
/// a release key whose public half is compiled into this helper, the tarball
/// must match the signed hash, and it is then built and signed locally.
public enum SelfUpdate {
    public static let repository = "b-nnett/codex-plusplus"
    public static let signerIdentity = "release@codexpp"
    public static let namespace = "codexpp-release"

    public static var latestManifestURL: URL { URL(string: "https://github.com/\(repository)/releases/latest/download/release.json")! }
    public static var latestSignatureURL: URL { URL(string: "https://github.com/\(repository)/releases/latest/download/release.json.sig")! }
    public static func artifactURL(_ manifest: ReleaseManifest) -> URL {
        URL(string: "https://github.com/\(repository)/releases/download/\(manifest.tag)/\(manifest.artifact)")!
    }

    /// The bundled allowed-signers file, or nil while no release key is configured.
    public static func allowedSigners() -> URL? { allowedSigners(at: Bundle.module.url(forResource: "release-signers", withExtension: nil)) }
    static func allowedSigners(at candidate: URL?) -> URL? {
        guard let url = candidate,
              let text = try? String(contentsOf: url, encoding: .utf8),
              text.split(separator: "\n").contains(where: { $0.hasPrefix(signerIdentity + " ") }) else { return nil }
        return url
    }

    /// Verifies an SSH signature (`ssh-keygen -Y sign -n codexpp-release`) over the manifest bytes.
    public static func verify(manifest: Data, signature: Data, allowedSigners: URL) throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("codexpp-release-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let signatureFile = directory.appendingPathComponent("release.json.sig")
        try signature.write(to: signatureFile)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/ssh-keygen")
        process.arguments = ["-Y", "verify", "-f", allowedSigners.path, "-I", signerIdentity, "-n", namespace, "-s", signatureFile.path]
        let input = Pipe(), output = Pipe()
        process.standardInput = input; process.standardOutput = output; process.standardError = output
        try process.run()
        input.fileHandleForWriting.write(manifest); try input.fileHandleForWriting.close()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            let detail = String(decoding: output.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
            throw PatchError.invalid("The release signature is not valid. \(detail)")
        }
    }

    /// Decodes a verified manifest and returns it when it is a newer, well-formed
    /// release of this repository; nil when it is not newer.
    public static func accept(_ data: Data, currentVersion: String) throws -> ReleaseManifest? {
        let manifest = try JSONDecoder().decode(ReleaseManifest.self, from: data)
        guard manifest.schema == 2, manifest.repo == repository, manifest.distribution == "source-only",
              manifest.tag == "v\(manifest.version)", manifest.artifact == "codex-pp-\(manifest.version)-source.tar.gz",
              manifest.version.range(of: #"^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$"#, options: .regularExpression) != nil,
              manifest.sha256.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil,
              manifest.commit.range(of: "^[0-9a-f]{40}$", options: .regularExpression) != nil,
              (1...512 * 1024 * 1024).contains(manifest.size) else { throw PatchError.invalid("The release manifest is malformed.") }
        return compare(manifest.version, currentVersion) == .orderedDescending ? manifest : nil
    }

    /// Semantic version order; a pre-release sorts before its release.
    public static func compare(_ a: String, _ b: String) -> ComparisonResult {
        func split(_ version: String) -> ([Int], String?) {
            let parts = version.split(separator: "-", maxSplits: 1).map(String.init)
            return (parts[0].split(separator: ".").map { Int($0) ?? 0 }, parts.count > 1 ? parts[1] : nil)
        }
        let (left, leftPre) = split(a), (right, rightPre) = split(b)
        for index in 0..<max(left.count, right.count) {
            let x = index < left.count ? left[index] : 0, y = index < right.count ? right[index] : 0
            if x != y { return x < y ? .orderedAscending : .orderedDescending }
        }
        switch (leftPre, rightPre) {
        case (nil, nil): return .orderedSame
        case (nil, _): return .orderedDescending
        case (_, nil): return .orderedAscending
        case let (l?, r?): return l == r ? .orderedSame : (l.compare(r, options: .numeric) == .orderedAscending ? .orderedAscending : .orderedDescending)
        }
    }

    /// The downloaded tarball must be exactly the signed artifact.
    public static func verifyArtifact(_ file: URL, manifest: ReleaseManifest) throws {
        let data = try Data(contentsOf: file, options: .mappedIfSafe)
        guard data.count == manifest.size, SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == manifest.sha256 else {
            throw PatchError.invalid("The downloaded release does not match its signed manifest.")
        }
    }

    /// Extracts the tarball into an empty directory and returns its single
    /// top-level source directory, `codex-pp-<version>`.
    public static func extract(_ tarball: URL, manifest: ReleaseManifest, into directory: URL) throws -> URL {
        let fm = FileManager.default
        try fm.createDirectory(at: directory, withIntermediateDirectories: true)
        guard try fm.contentsOfDirectory(atPath: directory.path).isEmpty else { throw PatchError.invalid("The update staging directory is not empty.") }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/tar")
        process.arguments = ["-xzf", tarball.path, "-C", directory.path, "--no-same-owner"]
        process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
        try process.run(); process.waitUntilExit()
        let entries = try fm.contentsOfDirectory(atPath: directory.path)
        let expected = "codex-pp-\(manifest.version)"
        guard process.terminationStatus == 0, entries == [expected] else { throw PatchError.invalid("The release archive has an unexpected layout.") }
        let root = directory.appendingPathComponent(expected)
        guard fm.fileExists(atPath: root.appendingPathComponent("scripts/build-app.sh").path),
              (try? String(contentsOf: root.appendingPathComponent("VERSION"), encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines) == manifest.version else {
            throw PatchError.invalid("The release archive is not the signed version.")
        }
        return root
    }

    /// The patch revision recorded in a receipt adapter id (chatgpt-macos-<build>-v<revision>).
    public static func patchRevision(ofAdapter id: String) -> Int? {
        guard let match = id.wholeMatch(of: /chatgpt-macos-[0-9]+-v([0-9]+)/) else { return nil }
        return Int(match.1)
    }
}

/// Handoff from the running helper to the staged one (`--finish-self-update`).
public struct SelfUpdateTicket: Codable, Equatable, Sendable {
    public let oldPID: Int32
    public let installedPath: String
    public let stagedPath: String
    public let version: String
    public let createdAt: Date
    public init(oldPID: Int32, installedPath: String, stagedPath: String, version: String, createdAt: Date) {
        self.oldPID = oldPID; self.installedPath = installedPath; self.stagedPath = stagedPath; self.version = version; self.createdAt = createdAt
    }
}

extension SelfUpdate {
    /// Puts the staged helper at the installed path with one atomic exchange and
    /// keeps the replaced one beside it as `.Codex++.previous.app`. A staged
    /// bundle on another volume is first copied next to the installed one.
    public static func swap(installed: URL, staged: URL) throws -> URL {
        let fm = FileManager.default
        let parent = installed.deletingLastPathComponent()
        guard installed.pathExtension == "app", info(installed)?["CFBundleIdentifier"] as? String == "dev.codexpp.helper",
              info(staged)?["CFBundleIdentifier"] as? String == "dev.codexpp.helper" else { throw PatchError.invalid("The update handoff names an unexpected bundle.") }
        var incoming = staged
        if staged.deletingLastPathComponent().standardizedFileURL != parent.standardizedFileURL {
            incoming = parent.appendingPathComponent(".Codex++.incoming.app")
            try? fm.removeItem(at: incoming)
            let copy = Process(); copy.executableURL = URL(fileURLWithPath: "/usr/bin/ditto"); copy.arguments = [staged.path, incoming.path]
            try copy.run(); copy.waitUntilExit()
            guard copy.terminationStatus == 0 else { throw PatchError.invalid("Could not copy the update next to Codex++.") }
        }
        guard renameatx_np(AT_FDCWD, incoming.path, AT_FDCWD, installed.path, UInt32(RENAME_SWAP)) == 0 else {
            throw PatchError.invalid("Could not swap in the update: \(String(cString: strerror(errno)))")
        }
        // The exchange left the old helper at the incoming path.
        let previous = parent.appendingPathComponent(".Codex++.previous.app")
        try? fm.removeItem(at: previous)
        try fm.moveItem(at: incoming, to: previous)
        return previous
    }

    /// A bundle's Info.plist, read from disk (Foundation caches Bundle objects by path).
    public static func info(_ bundle: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: bundle.appendingPathComponent("Contents/Info.plist")) else { return nil }
        return try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
    }
    /// Undoes `swap`: the previous helper goes back to the installed path.
    public static func rollBack(installed: URL, previous: URL) throws {
        guard renameatx_np(AT_FDCWD, previous.path, AT_FDCWD, installed.path, UInt32(RENAME_SWAP)) == 0 else {
            throw PatchError.invalid("Could not restore the previous Codex++: \(String(cString: strerror(errno)))")
        }
    }
}
