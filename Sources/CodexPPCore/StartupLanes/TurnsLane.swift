// The turns lane of startup edits: the chunks its edits target and their
// labels in the helper menu. Its edits live in startup-adapter.js between the
// "turns lane" markers.
extension StartupAdapter {
    static let turnsChunks: [StartupChunk] = []
}

extension StartupStatus {
    static let turnsLabels: [String: String] = [
        "commandOutputItemContentOnly": "Lighter command output updates",
    ]
}
