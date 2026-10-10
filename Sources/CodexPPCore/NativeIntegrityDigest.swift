import Foundation
import CryptoKit

public enum NativeIntegrityDigest {
    public static func discoverOffset(in bytes: Data, expected: Data) throws -> Int {
        var marker = Data("AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A".utf8)
        marker.append(contentsOf: [1,1]); marker.append(expected)
        guard expected.count == 32, let match = bytes.range(of: marker),
              bytes.range(of: marker, in: match.upperBound..<bytes.endIndex) == nil else {
            throw PatchError.invalid("The authenticated update must contain exactly one matching native integrity slot.")
        }
        return match.lowerBound
    }
    public static func dictionaryHash(_ integrity: [String: Any]) throws -> Data {
        var bytes = Data()
        for key in integrity.keys.sorted() {
            guard let item = integrity[key] as? [String: Any], let algorithm = item["algorithm"] as? String, algorithm == "SHA256", let hash = item["hash"] as? String, hash.count == 64 else { throw PatchError.invalid("Unexpected ASAR integrity dictionary.") }
            bytes.append(Data((key + algorithm + hash).utf8))
        }
        return Data(SHA256.hash(data: bytes))
    }
    public static func validate(_ original: Data, offset: Int, expected: Data, replacement: Data) throws {
        let sentinel = Data("AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A".utf8)
        guard offset >= 0, offset <= original.count - 66, expected.count == 32, replacement.count == 32,
              original.subdata(in: offset..<offset + 32) == sentinel,
              original[offset + 32] == 1, original[offset + 33] == 1,
              original.subdata(in: offset + 34..<offset + 66) == expected else { throw PatchError.invalid("The native integrity slot does not match the reviewed adapter.") }
    }
    public static func replacing(_ original: Data, offset: Int, expected: Data, replacement: Data) throws -> Data {
        try validate(original, offset: offset, expected: expected, replacement: replacement)
        var patched = original
        patched.replaceSubrange(offset + 34..<offset + 66, with: replacement)
        return patched
    }
}
