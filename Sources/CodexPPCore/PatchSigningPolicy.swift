import Foundation

public enum PatchSigningPolicy {
    /// A local signature cannot claim OpenAI's team, keychain access groups,
    /// app groups or push-notification identity. Preserve ordinary runtime and
    /// user permission entitlements only; reject sandboxed hosts.
    public static func localEntitlements(_ original: [String: Any]) throws -> [String: Any] {
        guard original["com.apple.security.app-sandbox"] as? Bool != true else { throw PatchError.invalid("Sandboxed App Store builds are not supported by the local patch signer.") }
        let allowed: Set<String> = [
            "com.apple.security.app-sandbox", "com.apple.security.automation.apple-events",
            "com.apple.security.cs.allow-jit", "com.apple.security.cs.allow-unsigned-executable-memory",
            "com.apple.security.device.audio-input", "com.apple.security.device.camera",
            "com.apple.security.files.user-selected.read-write", "com.apple.security.network.client",
            "com.apple.security.personal-information.calendars"
        ]
        var result = original.filter { allowed.contains($0.key) }
        // The unchanged Electron framework retains its vendor signature, whose
        // team differs from this ad-hoc root executable.
        result["com.apple.security.cs.disable-library-validation"] = true
        return result
    }
}
