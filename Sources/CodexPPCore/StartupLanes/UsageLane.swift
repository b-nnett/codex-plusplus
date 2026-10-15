// The usage lane of startup edits: the chunks its edits target and their
// labels in the helper menu. Its edits live in startup-adapter.js between the
// "usage lane" markers.
extension StartupAdapter {
    static let usageChunks: [StartupChunk] = []
}

extension StartupStatus {
    static let usageLabels: [String: String] = [
        "compactThreadDescription": "Lighter thread descriptions",
    ]
}
