// The streaming lane of startup edits: the chunks its edits target and their
// labels in the helper menu. Its edits live in startup-adapter.js between the
// "streaming lane" markers.
extension StartupAdapter {
    static let streamingChunks: [StartupChunk] = []
}

extension StartupStatus {
    static let streamingLabels: [String: String] = [:]
}
