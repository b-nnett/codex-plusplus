import Foundation
import CryptoKit

public enum PatchError: LocalizedError {
    case invalid(String)
    public var errorDescription: String? { if case .invalid(let message) = self { return message }; return nil }
}

public func sha256(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

public func fileSHA256(_ url: URL) throws -> String {
    let file = try FileHandle(forReadingFrom: url)
    defer { try? file.close() }
    var hash = SHA256()
    while let chunk = try file.read(upToCount: 1024 * 1024), !chunk.isEmpty { hash.update(data: chunk) }
    return hash.finalize().map { String(format: "%02x", $0) }.joined()
}

/// Keeps every existing payload offset and unpacked flag intact; replacements
/// are appended. No native modules are extracted or repacked.
public struct AsarArchive {
    /// Entries are read whole into memory; larger files are refused.
    public static let maxEntrySize = 16 * 1024 * 1024
    public let url: URL
    public let headerHash: String
    public let payloadOffset: UInt64
    public let fileSize: UInt64
    private let header: NSDictionary

    public init(_ url: URL) throws {
        self.url = url
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        fileSize = try file.seekToEnd()
        try file.seek(toOffset: 0)
        let prefix = try Self.read(file, count: 16)
        func uint(_ offset: Int) -> UInt64 { (0..<4).reduce(0) { $0 | UInt64(prefix[offset + $1]) << ($1 * 8) } }
        let headerSize = uint(4), pickleSize = uint(8), jsonSize = uint(12)
        guard uint(0) == 4, headerSize >= 8, headerSize <= 32 * 1024 * 1024,
              pickleSize + 4 == headerSize, jsonSize <= pickleSize - 4,
              8 + headerSize <= fileSize else { throw PatchError.invalid("Invalid ASAR header.") }
        let json = try Self.read(file, count: Int(jsonSize))
        guard let parsed = try JSONSerialization.jsonObject(with: json) as? NSDictionary, parsed["files"] is NSDictionary else { throw PatchError.invalid("Invalid ASAR directory.") }
        header = parsed; headerHash = sha256(json); payloadOffset = 8 + headerSize
    }

    private static func read(_ file: FileHandle, count: Int) throws -> Data {
        let data = try file.read(upToCount: count) ?? Data()
        guard data.count == count else { throw PatchError.invalid("Truncated ASAR archive.") }
        return data
    }
    private func entry(_ path: String) throws -> [String: Any] {
        let parts = path.split(separator: "/", omittingEmptySubsequences: false)
        guard !parts.isEmpty, !parts.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else { throw PatchError.invalid("Unsafe ASAR path.") }
        // NSDictionary lookups avoid bridging an entire directory map for
        // every component or building a full index for two-entry status checks.
        var node = header
        for part in parts {
            guard let files = node["files"] as? NSDictionary,
                  let child = files[String(part)] as? NSDictionary else { throw PatchError.invalid("Missing ASAR entry: \(path)") }
            node = child
        }
        guard node["link"] == nil, node["unpacked"] as? Bool != true else { throw PatchError.invalid("Bootstrap must be a packed, regular ASAR entry.") }
        guard let result = node as? [String: Any] else { throw PatchError.invalid("Invalid ASAR entry.") }
        return result
    }
    public func data(at path: String) throws -> Data {
        let node = try entry(path)
        guard let size = node["size"] as? Int, size <= Self.maxEntrySize else { throw PatchError.invalid("ASAR entry \(path) exceeds the \(Self.maxEntrySize >> 20) MB limit.") }
        guard let offsetString = node["offset"] as? String, let offset = UInt64(offsetString), size >= 0,
              offset <= fileSize - payloadOffset, UInt64(size) <= fileSize - payloadOffset - offset else { throw PatchError.invalid("Invalid ASAR entry bounds.") }
        let file = try FileHandle(forReadingFrom: url); defer { try? file.close() }
        try file.seek(toOffset: payloadOffset + offset)
        let data = try Self.read(file, count: size)
        if let integrity = node["integrity"] as? [String: Any] {
            guard integrity["algorithm"] as? String == "SHA256", integrity["hash"] as? String == sha256(data) else { throw PatchError.invalid("ASAR entry failed integrity verification.") }
        }
        return data
    }
    public func packedFiles(in directory: String) throws -> [String] {
        let node = try entry(directory)
        guard let files = node["files"] as? [String: [String: Any]] else { throw PatchError.invalid("Expected an ASAR directory.") }
        return files.compactMap { name, child in
            guard !name.contains("/"), name != ".", name != "..", child["offset"] is String,
                  child["link"] == nil, child["unpacked"] as? Bool != true else { return nil }
            return directory + "/" + name
        }.sorted()
    }
    public func replacing(_ path: String, with replacement: Data, output: URL) throws -> String {
        try replacing([(path, replacement)], output: output)
    }
    public func replacing(_ replacements: [(String, Data)], output: URL) throws -> String {
        guard !replacements.isEmpty, Set(replacements.map { $0.0 }).count == replacements.count else { throw PatchError.invalid("ASAR replacements must contain unique paths.") }
        if let (path, _) = replacements.first(where: { $0.1.count > Self.maxEntrySize }) { throw PatchError.invalid("Patched ASAR entry \(path) exceeds the \(Self.maxEntrySize >> 20) MB limit.") }
        guard output.standardizedFileURL != url.standardizedFileURL else { throw PatchError.invalid("Patch output must be staged separately.") }
        guard var next = header as? [String: Any] else { throw PatchError.invalid("Invalid ASAR directory.") }
        var appended: UInt64 = 0
        for (path, replacement) in replacements {
            var node = try entry(path)
            let blockSize = 4 * 1024 * 1024
            var blocks: [String] = []
            for start in stride(from: 0, to: replacement.count, by: blockSize) { blocks.append(sha256(replacement.subdata(in: start..<min(start + blockSize, replacement.count)))) }
            if blocks.isEmpty { blocks = [sha256(Data())] }
            node["offset"] = String(fileSize - payloadOffset + appended); node["size"] = replacement.count
            node["integrity"] = ["algorithm": "SHA256", "hash": sha256(replacement), "blockSize": blockSize, "blocks": blocks]
            func replace(_ tree: inout [String: Any], _ parts: ArraySlice<String>) throws {
                guard let name = parts.first, var files = tree["files"] as? [String: Any] else { throw PatchError.invalid("Invalid ASAR tree.") }
                if parts.count == 1 { files[name] = node }
                else { guard var child = files[name] as? [String: Any] else { throw PatchError.invalid("Missing ASAR directory.") }; try replace(&child, parts.dropFirst()); files[name] = child }
                tree["files"] = files
            }
            try replace(&next, path.split(separator: "/").map(String.init)[...])
            appended += UInt64(replacement.count)
        }
        let json = try JSONSerialization.data(withJSONObject: next, options: [.sortedKeys, .withoutEscapingSlashes])
        let padded = (json.count + 3) & ~3
        var prefix = Data()
        for integer in [4, padded + 8, padded + 4, json.count] {
            var little = UInt32(integer).littleEndian
            withUnsafeBytes(of: &little) { prefix.append(contentsOf: $0) }
        }
        prefix.append(json); prefix.append(Data(repeating: 0, count: padded - json.count))
        guard FileManager.default.createFile(atPath: output.path, contents: nil) else { throw PatchError.invalid("Cannot create staged ASAR.") }
        let input = try FileHandle(forReadingFrom: url), out = try FileHandle(forWritingTo: output)
        defer { try? input.close(); try? out.close() }
        try out.write(contentsOf: prefix); try input.seek(toOffset: payloadOffset)
        while let chunk = try input.read(upToCount: 1024 * 1024), !chunk.isEmpty { try out.write(contentsOf: chunk) }
        for (_, replacement) in replacements { try out.write(contentsOf: replacement) }
        try out.synchronize()
        let verified = try AsarArchive(output)
        for (path, replacement) in replacements {
            guard try verified.data(at: path) == replacement else { throw PatchError.invalid("Staged ASAR replacement did not verify.") }
        }
        return verified.headerHash
    }
}
