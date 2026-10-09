import Foundation
import CodexPPCore

struct CommandResult: Sendable { let status: Int32; let output: String }

func runCommand(_ executable: String, _ arguments: [String]) async throws -> CommandResult {
    try await Task.detached {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        try process.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        return CommandResult(status: process.terminationStatus, output: String(decoding: data, as: UTF8.self))
    }.value
}
