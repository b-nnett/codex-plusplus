import Foundation

/// The desktop app was renamed to ChatGPT; its bundle ID is still com.openai.codex.
public enum DesktopAppLocator {
    public static let bundleIdentifier = "com.openai.codex"
    public static func isSupported(_ url: URL) -> Bool {
        Bundle(url: url)?.bundleIdentifier == bundleIdentifier
    }
    public static func resolve(configuredPath: String, candidates: [URL]) -> String? {
        let configured = URL(fileURLWithPath: configuredPath)
        if isSupported(configured) { return configured.path }
        return candidates.first(where: isSupported)?.path
    }
}
