import Foundation
import Security
import Darwin

/// Vendor source is JSON data for a parser, never executable JavaScript.
enum JavaScriptDiscovery {
    static func run(archive: AsarArchive, adapter: String, input: [String: Any]) throws -> Data? {
        let resources = archive.url.deletingLastPathComponent()
        let node = resources.appendingPathComponent("cua_node/bin/node")
        guard FileManager.default.fileExists(atPath: node.path) else { return nil }
        guard node.resolvingSymlinksInPath().path.hasPrefix(resources.resolvingSymlinksInPath().path + "/") else {
            throw PatchError.invalid("The parser runtime is outside the app resources.")
        }
        var code: SecStaticCode?
        var requirement: SecRequirement?
        let policy = "identifier node and anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] and certificate leaf[field.1.2.840.113635.100.6.1.13] and certificate leaf[subject.OU] = \"2DC432GLL2\""
        guard SecStaticCodeCreateWithPath(node as CFURL, [], &code) == errSecSuccess, let code,
              SecRequirementCreateWithString(policy as CFString, [], &requirement) == errSecSuccess, let requirement,
              SecStaticCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSStrictValidate), requirement) == errSecSuccess else {
            throw PatchError.invalid("The bundled parser runtime failed OpenAI signature verification.")
        }
        guard ["settings", "bookmarks", "shell", "browser", "sidebar", "startup"].contains(adapter),
              let runner = Bundle.module.url(forResource: "parser-runner", withExtension: "js") else {
            throw PatchError.invalid("The parser runner is unavailable.")
        }
        let fm = FileManager.default
        let directory = fm.temporaryDirectory.appendingPathComponent("codexpp-parser-\(UUID().uuidString)")
        try fm.createDirectory(at: directory, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        defer { try? fm.removeItem(at: directory) }
        let request = directory.appendingPathComponent("input.json"), output = directory.appendingPathComponent("output.json"), log = directory.appendingPathComponent("error.log")
        try JSONSerialization.data(withJSONObject: input).write(to: request)
        _ = fm.createFile(atPath: log.path, contents: nil)
        let errors = try FileHandle(forWritingTo: log)
        defer { try? errors.close() }
        let process = Process()
        process.executableURL = node
        process.arguments = [runner.path, adapter, request.path, output.path]
        process.currentDirectoryURL = directory
        process.environment = ["PATH": "/usr/bin:/bin", "HOME": fm.homeDirectoryForCurrentUser.path, "TMPDIR": directory.path]
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = errors; process.standardError = errors
        try process.run()
        let deadline = Date().addingTimeInterval(60)
        while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.02) }
        if process.isRunning {
            process.terminate(); Thread.sleep(forTimeInterval: 0.2)
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            process.waitUntilExit()
            throw PatchError.invalid("Code discovery timed out; the app was not patched.")
        }
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            throw PatchError.invalid("Code discovery failed: " + String(decoding: try Data(contentsOf: log).suffix(4096), as: UTF8.self))
        }
        return try Data(contentsOf: output)
    }
}
