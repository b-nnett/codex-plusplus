import Foundation
import Security
import CryptoKit

/// Pin an Apple-issued Developer ID certificate. A self-signed certificate has
/// a stable designated requirement, but Keychain partitions still use CDHash.
public enum LocalSigningIdentity {
    public static let name = "Developer ID Application:"
    public static func resolve(support: URL, helper: URL? = nil) throws -> String {
        let file = support.appendingPathComponent("Patching/signing-identity.json")
        let query: [String: Any] = [kSecClass as String: kSecClassIdentity, kSecReturnRef as String: true, kSecMatchLimit as String: kSecMatchLimitAll]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let identities = result as? [SecIdentity] else { throw PatchError.invalid("An installed Developer ID Application signing identity is required for stable Keychain partitions.") }
        var candidates: Set<String> = []
        for identity in identities {
            var certificate: SecCertificate?
            guard SecIdentityCopyCertificate(identity, &certificate) == errSecSuccess, let certificate,
                  (SecCertificateCopySubjectSummary(certificate) as String?)?.hasPrefix(name) == true else { continue }
            let bytes = SecCertificateCopyData(certificate) as Data
            candidates.insert(Insecure.SHA1.hash(data: bytes).map { String(format: "%02X", $0) }.joined())
        }
        if FileManager.default.fileExists(atPath: file.path) {
            let saved = try JSONDecoder().decode(Identity.self, from: Data(contentsOf: file))
            guard candidates.contains(saved.fingerprint) else { throw PatchError.invalid("The pinned Developer ID signing identity is unavailable or is a self-signed legacy identity. Refusing to change signers automatically.") }
            if let helper { try validateHelper(helper, fingerprint: saved.fingerprint) }
            return saved.fingerprint
        }
        guard candidates.count == 1, let fingerprint = candidates.first else { throw PatchError.invalid("Expected one Developer ID Application identity, or an explicitly configured certificate pin.") }
        if let helper { try validateHelper(helper, fingerprint: fingerprint) }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(Identity(fingerprint: fingerprint)).write(to: file, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        return fingerprint
    }
    private static func validateHelper(_ helper: URL, fingerprint: String) throws {
        var code: SecStaticCode?
        var requirement: SecRequirement?
        let policy = "anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] and certificate leaf[field.1.2.840.113635.100.6.1.13] and certificate leaf = H\"\(fingerprint)\" and identifier \"dev.codexpp.helper\""
        guard SecStaticCodeCreateWithPath(helper as CFURL, [], &code) == errSecSuccess, let code,
              SecRequirementCreateWithString(policy as CFString, [], &requirement) == errSecSuccess, let requirement,
              SecStaticCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSStrictValidate | kSecCSCheckNestedCode), requirement) == errSecSuccess else { throw PatchError.invalid("The helper must use the pinned Apple-issued Developer ID certificate.") }
    }
    private struct Identity: Codable { let fingerprint: String }
}
