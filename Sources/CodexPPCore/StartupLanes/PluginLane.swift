// The plugin lane of startup edits: the chunks its edits target and their
// labels in the helper menu. Its edits live in startup-adapter.js between the
// "plugin lane" markers.
extension StartupAdapter {
    static let pluginChunks: [StartupChunk] = []
}

extension StartupStatus {
    static let pluginLabels: [String: String] = [:]
}
