// The keepalive lane of startup edits: the chunks its edits target and their
// labels in the helper menu. Its edits live in startup-adapter.js between the
// "keepalive lane" markers.
extension StartupAdapter {
    static let keepaliveChunks: [StartupChunk] = []
}

extension StartupStatus {
    static let keepaliveLabels: [String: String] = [:]
}
