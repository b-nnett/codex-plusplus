import XCTest
@testable import CodexPPCore

final class AsarPatchTests: XCTestCase {
    static func fixture() throws -> (URL, Data, PatchAdapter) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("codexpp-patch-test-\(UUID().uuidString)").resolvingSymlinksInPath()
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let source = Data("module.exports = 'original';".utf8)
        let package = Data("{\"name\":\"openai-codex-electron\",\"main\":\"main.js\"}".utf8)
        let native: [String: Any] = ["size": 10, "unpacked": true, "integrity": ["algorithm": "SHA256", "hash": "native-hash"]]
        func entry(_ bytes: Data, _ offset: Int) -> [String: Any] { ["size": bytes.count, "offset": String(offset), "integrity": ["algorithm": "SHA256", "hash": sha256(bytes), "blockSize": 4194304, "blocks": [sha256(bytes)]]] }
        let tree: [String: Any] = ["files": ["main.js": entry(source, 0), "package.json": entry(package, source.count), "native.node": native]]
        let header = try JSONSerialization.data(withJSONObject: tree, options: [.sortedKeys])
        let padded = (header.count + 3) & ~3
        var data = Data()
        for value in [4, padded + 8, padded + 4, header.count] { var int = UInt32(value).littleEndian; withUnsafeBytes(of: &int) { data.append(contentsOf: $0) } }
        data.append(header); data.append(Data(repeating: 0, count: padded - header.count)); data.append(source); data.append(package)
        let path = root.appendingPathComponent("app.asar"); try data.write(to: path)
        let adapter = PatchAdapter(id: "fixture", version: "1", build: "1", main: "main.js", mainHash: sha256(source), headerHash: sha256(header))
        return (path, source, adapter)
    }
    func testReplacementPreservesOtherPayloadsAndOriginalArchive() throws {
        let (path, source, _) = try Self.fixture(); defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        let original = try Data(contentsOf: path), input = try AsarArchive(path)
        let output = path.appendingPathExtension("patched")
        let replacement = Data("/* patched */\n".utf8) + source
        let hash = try input.replacing("main.js", with: replacement, output: output)
        let result = try AsarArchive(output)
        XCTAssertEqual(hash, result.headerHash)
        XCTAssertEqual(try result.data(at: "main.js"), replacement)
        XCTAssertEqual(try result.data(at: "package.json"), try input.data(at: "package.json"))
        XCTAssertEqual(try Data(contentsOf: path), original)
        let bytes = try Data(contentsOf: output)
        let jsonLength = (0..<4).reduce(0) { $0 | Int(bytes[12 + $1]) << ($1 * 8) }
        let tree = try JSONSerialization.jsonObject(with: bytes.subdata(in: 16..<16 + jsonLength)) as! [String: Any]
        let entries = tree["files"] as! [String: Any]
        XCTAssertEqual((entries["native.node"] as! [String: Any])["unpacked"] as? Bool, true)
        XCTAssertThrowsError(try result.data(at: "native.node"))
    }
    func testCorruptionAndTruncationAreRejected() throws {
        let (path, _, _) = try Self.fixture(); defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        let archive = try AsarArchive(path)
        var bytes = try Data(contentsOf: path); bytes[Int(archive.payloadOffset)] ^= 1; try bytes.write(to: path)
        XCTAssertThrowsError(try AsarArchive(path).data(at: "main.js"))
        try bytes.prefix(14).write(to: path)
        XCTAssertThrowsError(try AsarArchive(path))
    }
    func testBatchReplacementPreservesPayloadAndMatchesSequentialEntries() throws {
        let (path, _, _) = try Self.fixture()
        defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        let input = try AsarArchive(path), before = try Data(contentsOf: path)
        let replacements = [("main.js", Data("updated main".utf8)), ("package.json", Data("{\"updated\":true}".utf8))]
        let batch = path.appendingPathExtension("batch"), first = path.appendingPathExtension("first"), last = path.appendingPathExtension("last")
        _ = try input.replacing(replacements, output: batch)
        _ = try input.replacing(replacements[0].0, with: replacements[0].1, output: first)
        _ = try AsarArchive(first).replacing(replacements[1].0, with: replacements[1].1, output: last)
        let result = try AsarArchive(batch), sequential = try AsarArchive(last)
        for (path, bytes) in replacements {
            XCTAssertEqual(try result.data(at: path), bytes)
            XCTAssertEqual(try result.data(at: path), try sequential.data(at: path))
        }
        let output = try Data(contentsOf: batch)
        XCTAssertEqual(output.subdata(in: Int(result.payloadOffset)..<Int(result.payloadOffset + input.fileSize - input.payloadOffset)), before.subdata(in: Int(input.payloadOffset)..<before.count))
        XCTAssertEqual(try Data(contentsOf: path), before)
        XCTAssertThrowsError(try result.data(at: "native.node"))
        XCTAssertThrowsError(try input.replacing([replacements[0], replacements[0]], output: batch))
        XCTAssertThrowsError(try input.replacing([("missing.js", Data())], output: batch))
    }
    func testIndexedArchiveDoesNotAcceptSlashNamesAsDirectoryAliases() throws {
        let (path, source, _) = try Self.fixture()
        defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        let original = try Data(contentsOf: path), archive = try AsarArchive(path)
        let length = (0..<4).reduce(0) { $0 | Int(original[12 + $1]) << ($1 * 8) }
        var tree = try JSONSerialization.jsonObject(with: original.subdata(in: 16..<16 + length)) as! [String: Any]
        var files = tree["files"] as! [String: Any]
        files["alias/main.js"] = files["main.js"]; tree["files"] = files
        let json = try JSONSerialization.data(withJSONObject: tree)
        let padded = (json.count + 3) & ~3
        var bytes = Data()
        for value in [4, padded + 8, padded + 4, json.count] {
            var little = UInt32(value).littleEndian
            withUnsafeBytes(of: &little) { bytes.append(contentsOf: $0) }
        }
        bytes.append(json); bytes.append(Data(repeating: 0, count: padded - json.count))
        bytes.append(original.subdata(in: Int(archive.payloadOffset)..<original.count))
        try bytes.write(to: path)
        let indexed = try AsarArchive(path)
        XCTAssertThrowsError(try indexed.data(at: "alias/main.js"))
        XCTAssertEqual(try indexed.data(at: "main.js"), source)
    }
    func testUnknownBuildAndModifiedBootstrapAreRejected() throws {
        let (path, source, adapter) = try Self.fixture(); defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        let archive = try AsarArchive(path)
        XCTAssertEqual(try adapter.validate(version: "1", build: "1", archive: archive), source)
        XCTAssertThrowsError(try adapter.validate(version: "2", build: "1", archive: archive))
        XCTAssertThrowsError(try adapter.validate(version: "1", build: "2", archive: archive))
        let other = PatchAdapter(id: "fixture", version: "1", build: "1", main: "main.js", mainHash: "wrong", headerHash: archive.headerHash)
        XCTAssertThrowsError(try other.validate(version: "1", build: "1", archive: archive))
    }
    func testUnsafePathsAndInPlacePatchAreRejected() throws {
        let (path, source, _) = try Self.fixture(); defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        let archive = try AsarArchive(path)
        for unsafe in ["../main.js", "/main.js", "./main.js", "main.js/"] { XCTAssertThrowsError(try archive.data(at: unsafe)) }
        XCTAssertThrowsError(try archive.replacing("main.js", with: source, output: path))
    }
    func testBootstrapContainsQuotedConfigurationAndPreservesOriginalEntry() throws {
        let (path, source, adapter) = try Self.fixture(); defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        let bootstrap = try adapter.bootstrap(original: source, port: 9222, helper: URL(fileURLWithPath: "/tmp/Example 'quoted' ++.app"), support: URL(fileURLWithPath: "/tmp/Support"))
        let text = String(decoding: bootstrap, as: UTF8.self)
        XCTAssertTrue(text.hasSuffix(String(decoding: source, as: UTF8.self)))
        XCTAssertFalse(text.contains("appendSwitch('remote-debugging"))
        XCTAssertTrue(text.contains("removeSwitch('remote-debugging-port')"))
        XCTAssertTrue(text.contains("ppNativeRuntime"))
        XCTAssertTrue(text.contains("--codexpp-probe"))
        XCTAssertTrue(text.contains("computer-use-start-capture"))
        XCTAssertTrue(text.contains("TeamIdentifier=2DC432GLL2"))
        XCTAssertTrue(text.contains("cua-repl.mjs"))
        XCTAssertTrue(text.contains("NODE_REPL_TRUSTED_SERVICES"))
        XCTAssertTrue(text.contains("sky.get_app_state"))
        XCTAssertTrue(text.contains("__CODEXPP_APPSHOT_V1__"))
        XCTAssertTrue(text.contains("return {...config, args:[parent, ...config.args]};"))
        XCTAssertFalse(text.contains("command:node, args:[parent"))
        XCTAssertTrue(text.contains("update: {type: 'completed'}"))
        XCTAssertFalse(text.contains("bare-modifier-monitor --key DoubleCommand"))
        XCTAssertFalse(text.contains("Runtime.addBinding"))
        XCTAssertFalse(text.contains("CODEX_ELECTRON_START_IN_BACKGROUND"))
        XCTAssertFalse(text.contains("ppStartBroker"))
        XCTAssertTrue(text.contains("ppNativeBrowser.setEnabled(event, request.enabled)"))
        XCTAssertTrue(text.contains("type:'codexpp-browser-autofill-result'"))
        XCTAssertFalse(text.contains("shell:true"))
        XCTAssertTrue(text.contains("enableCompileCache"))
        // Benchmark experiments (script probes, injected CSS, V8 flags) ship only in dev builds.
        XCTAssertEqual(text.contains("experiments.json"), PatchAdapter.experimentsEnabled)
        XCTAssertEqual(text.contains("executeJavaScript(ppExperiments.perfProbe)"), PatchAdapter.experimentsEnabled)
        let script = path.deletingLastPathComponent().appendingPathComponent("bootstrap.js")
        try bootstrap.write(to: script)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["node", "--check", script.path]
        let output = Pipe(); process.standardOutput = output; process.standardError = output
        try process.run(); process.waitUntilExit()
        XCTAssertEqual(process.terminationStatus, 0, String(decoding: output.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self))
        XCTAssertThrowsError(try adapter.bootstrap(original: source, port: 80, helper: URL(fileURLWithPath: "/tmp/Helper.app"), support: URL(fileURLWithPath: "/tmp/Support")))
    }
    func testOversizedReplacementHasClearError() throws {
        let (path, _, _) = try Self.fixture(); defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        let big = Data(count: AsarArchive.maxEntrySize + 1)
        XCTAssertThrowsError(try AsarArchive(path).replacing("main.js", with: big, output: path.appendingPathExtension("next"))) {
            XCTAssertTrue($0.localizedDescription.contains("exceeds"), $0.localizedDescription)
        }
    }
    func testSizeReadsHeaderWithoutPayload() throws {
        let (path, source, _) = try Self.fixture(); defer { try? FileManager.default.removeItem(at: path.deletingLastPathComponent()) }
        XCTAssertEqual(try AsarArchive(path).size(at: "main.js"), source.count)
        XCTAssertThrowsError(try AsarArchive(path).size(at: "missing.js"))
    }
}
