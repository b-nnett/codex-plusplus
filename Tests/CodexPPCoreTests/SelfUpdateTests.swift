import XCTest
import CryptoKit
@testable import CodexPPCore

final class SelfUpdateTests: XCTestCase {
    private func run(_ tool: String, _ arguments: [String], input: Data? = nil) throws -> Int32 {
        let process = Process(); process.executableURL = URL(fileURLWithPath: tool); process.arguments = arguments
        process.standardOutput = FileHandle.nullDevice; process.standardError = FileHandle.nullDevice
        let pipe = Pipe(); if input != nil { process.standardInput = pipe }
        try process.run()
        if let input { pipe.fileHandleForWriting.write(input); try pipe.fileHandleForWriting.close() }
        process.waitUntilExit(); return process.terminationStatus
    }
    private func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("selfupdate-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
    private func manifest(version: String = "0.2.0", repo: String = SelfUpdate.repository, sha256: String = String(repeating: "a", count: 64), size: Int = 10) -> Data {
        try! JSONSerialization.data(withJSONObject: ["schema": 2, "repo": repo, "tag": "v\(version)", "version": version, "commit": String(repeating: "b", count: 40),
            "artifact": "codex-pp-\(version)-source.tar.gz", "sha256": sha256, "size": size, "patchRevision": 150, "distribution": "source-only"], options: [.sortedKeys])
    }

    func testVersionsCompareSemantically() {
        XCTAssertEqual(SelfUpdate.compare("0.2.0", "0.1.9"), .orderedDescending)
        XCTAssertEqual(SelfUpdate.compare("0.10.0", "0.9.0"), .orderedDescending)
        XCTAssertEqual(SelfUpdate.compare("1.0.0-beta.2", "1.0.0"), .orderedAscending)
        XCTAssertEqual(SelfUpdate.compare("1.0.0-beta.10", "1.0.0-beta.2"), .orderedDescending)
        XCTAssertEqual(SelfUpdate.compare("1.0", "1.0.0"), .orderedSame)
    }

    func testOnlyNewerWellFormedReleasesOfThisRepositoryAreAccepted() throws {
        XCTAssertEqual(try SelfUpdate.accept(manifest(), currentVersion: "0.1.0")?.version, "0.2.0")
        XCTAssertNil(try SelfUpdate.accept(manifest(version: "0.1.0"), currentVersion: "0.1.0"), "same version")
        XCTAssertNil(try SelfUpdate.accept(manifest(version: "0.0.9"), currentVersion: "0.1.0"), "no downgrades")
        XCTAssertThrowsError(try SelfUpdate.accept(manifest(repo: "someone/else"), currentVersion: "0.1.0"), "another repository's release")
        XCTAssertThrowsError(try SelfUpdate.accept(manifest(sha256: "nothex"), currentVersion: "0.1.0"))
        var fields = try JSONSerialization.jsonObject(with: manifest()) as! [String: Any]
        fields["tag"] = "v9.9.9"
        XCTAssertThrowsError(try SelfUpdate.accept(JSONSerialization.data(withJSONObject: fields), currentVersion: "0.1.0"), "tag must name the version")
    }

    func testSignaturesMustComeFromTheReleaseKeyInTheReleaseNamespace() throws {
        let root = try temporaryDirectory(); defer { try? FileManager.default.removeItem(at: root) }
        let key = root.appendingPathComponent("release_key")
        XCTAssertEqual(try run("/usr/bin/ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "test", "-f", key.path]), 0)
        let publicKey = try String(contentsOf: root.appendingPathComponent("release_key.pub"), encoding: .utf8).split(separator: " ").prefix(2).joined(separator: " ")
        let signers = root.appendingPathComponent("allowed")
        try "\(SelfUpdate.signerIdentity) namespaces=\"\(SelfUpdate.namespace)\" \(publicKey)\n".write(to: signers, atomically: true, encoding: .utf8)
        XCTAssertEqual(SelfUpdate.allowedSigners(at: signers), signers)
        let body = manifest(), file = root.appendingPathComponent("release.json")
        try body.write(to: file)
        XCTAssertEqual(try run("/usr/bin/ssh-keygen", ["-Y", "sign", "-f", key.path, "-n", SelfUpdate.namespace, file.path]), 0)
        let signature = try Data(contentsOf: root.appendingPathComponent("release.json.sig"))
        XCTAssertNoThrow(try SelfUpdate.verify(manifest: body, signature: signature, allowedSigners: signers))
        XCTAssertThrowsError(try SelfUpdate.verify(manifest: manifest(version: "9.0.0"), signature: signature, allowedSigners: signers), "a changed manifest")
        // A signature for another purpose (namespace) does not count.
        try FileManager.default.removeItem(at: root.appendingPathComponent("release.json.sig"))
        XCTAssertEqual(try run("/usr/bin/ssh-keygen", ["-Y", "sign", "-f", key.path, "-n", "git", file.path]), 0)
        XCTAssertThrowsError(try SelfUpdate.verify(manifest: body, signature: Data(contentsOf: root.appendingPathComponent("release.json.sig")), allowedSigners: signers))
        // Without a listed key, updates are disabled.
        let empty = root.appendingPathComponent("empty"); try "# no key yet\n".write(to: empty, atomically: true, encoding: .utf8)
        XCTAssertNil(SelfUpdate.allowedSigners(at: empty))
    }

    func testTheDownloadMustBeTheSignedArtifactWithTheExpectedLayout() throws {
        let root = try temporaryDirectory(); defer { try? FileManager.default.removeItem(at: root) }
        let source = root.appendingPathComponent("src/codex-pp-0.2.0")
        try FileManager.default.createDirectory(at: source.appendingPathComponent("scripts"), withIntermediateDirectories: true)
        try "#!/bin/bash\n".write(to: source.appendingPathComponent("scripts/build-app.sh"), atomically: true, encoding: .utf8)
        try "0.2.0\n".write(to: source.appendingPathComponent("VERSION"), atomically: true, encoding: .utf8)
        let tarball = root.appendingPathComponent("codex-pp-0.2.0-source.tar.gz")
        XCTAssertEqual(try run("/usr/bin/tar", ["-czf", tarball.path, "-C", root.appendingPathComponent("src").path, "codex-pp-0.2.0"]), 0)
        let data = try Data(contentsOf: tarball)
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        let release = try XCTUnwrap(SelfUpdate.accept(manifest(sha256: hash, size: data.count), currentVersion: "0.1.0"))
        XCTAssertNoThrow(try SelfUpdate.verifyArtifact(tarball, manifest: release))
        let extracted = try SelfUpdate.extract(tarball, manifest: release, into: root.appendingPathComponent("out"))
        XCTAssertEqual(extracted.lastPathComponent, "codex-pp-0.2.0")
        XCTAssertThrowsError(try SelfUpdate.extract(tarball, manifest: release, into: root.appendingPathComponent("out")), "never into a non-empty directory")
        try (data + Data([0])).write(to: tarball)
        XCTAssertThrowsError(try SelfUpdate.verifyArtifact(tarball, manifest: release), "a changed download")
    }

    func testReceiptRevisions() {
        XCTAssertEqual(SelfUpdate.patchRevision(ofAdapter: "chatgpt-macos-20398-v144"), 144)
        XCTAssertNil(SelfUpdate.patchRevision(ofAdapter: "something-else"))
    }

    private func helperBundle(_ url: URL, version: String) throws {
        try FileManager.default.createDirectory(at: url.appendingPathComponent("Contents"), withIntermediateDirectories: true)
        let info: [String: Any] = ["CFBundleIdentifier": "dev.codexpp.helper", "CFBundleShortVersionString": version, "CFBundlePackageType": "APPL"]
        try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0).write(to: url.appendingPathComponent("Contents/Info.plist"))
    }
    private func version(_ bundle: URL) -> String? {
        // Read the plist itself: Foundation caches Bundle objects by path.
        (try? PropertyListSerialization.propertyList(from: Data(contentsOf: bundle.appendingPathComponent("Contents/Info.plist")), format: nil) as? [String: Any])?["CFBundleShortVersionString"] as? String
    }
    func testSwapInstallsInPlaceKeepsThePreviousAndRollsBack() throws {
        let root = try temporaryDirectory(); defer { try? FileManager.default.removeItem(at: root) }
        let installed = root.appendingPathComponent("Codex++.app"), staged = root.appendingPathComponent("Updates/0.2.0/Codex++.app")
        try helperBundle(installed, version: "0.1.0"); try helperBundle(staged, version: "0.2.0")
        let previous = try SelfUpdate.swap(installed: installed, staged: staged)
        XCTAssertEqual(version(installed), "0.2.0")
        XCTAssertEqual(previous.lastPathComponent, ".Codex++.previous.app")
        try SelfUpdate.rollBack(installed: installed, previous: previous)
        XCTAssertEqual(version(installed), "0.1.0")
        let stranger = root.appendingPathComponent("Other.app")
        try FileManager.default.createDirectory(at: stranger.appendingPathComponent("Contents"), withIntermediateDirectories: true)
        XCTAssertThrowsError(try SelfUpdate.swap(installed: installed, staged: stranger), "only Codex++ bundles")
    }
}
