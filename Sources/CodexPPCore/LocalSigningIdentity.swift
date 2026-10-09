import Foundation
import Security
import CryptoKit

/// Pin the certificate, never a particular executable's changing code hash.
public enum LocalSigningIdentity {
    public static let name = "Codex++ Local Signing"
    public static func resolve(support: URL) throws -> String {
        let file = support.appendingPathComponent("Patching/signing-identity.json")
        let query: [String: Any] = [kSecClass as String: kSecClassIdentity, kSecReturnRef as String: true, kSecMatchLimit as String: kSecMatchLimitAll]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let identities = result as? [SecIdentity] else { throw PatchError.invalid("Create a persistent ‘Codex++ Local Signing’ code-signing identity in Keychain Access before patching. Ad-hoc signing would reset Keychain trust on every patch.") }
        var candidates: Set<String> = []
        for identity in identities {
            var certificate: SecCertificate?
            guard SecIdentityCopyCertificate(identity, &certificate) == errSecSuccess, let certificate,
                  SecCertificateCopySubjectSummary(certificate) as String? == name else { continue }
            let bytes = SecCertificateCopyData(certificate) as Data
            candidates.insert(Insecure.SHA1.hash(data: bytes).map { String(format: "%02X", $0) }.joined())
        }
        if FileManager.default.fileExists(atPath: file.path) {
            let saved = try JSONDecoder().decode(Identity.self, from: Data(contentsOf: file))
            guard candidates.contains(saved.fingerprint) else { throw PatchError.invalid("The pinned Codex++ signing identity is unavailable. Restore it in Keychain Access; refusing to silently change the app’s identity.") }
            return saved.fingerprint
        }
        guard candidates.count == 1, let fingerprint = candidates.first else { throw PatchError.invalid("Expected one ‘Codex++ Local Signing’ identity in Keychain Access. Refusing an ambiguous or missing signer.") }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(Identity(fingerprint: fingerprint)).write(to: file, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        return fingerprint
    }
    private struct Identity: Codable { let fingerprint: String }
}
