// The switchdata lane of startup edits: the chunks its edits target and their
// labels in the helper menu. Its edits live in startup-adapter.js between the
// "switchdata lane" markers.
extension StartupAdapter {
    static let switchdataChunks: [StartupChunk] = []
}

extension StartupStatus {
    static let switchdataLabels: [String: String] = [
        "parallelThreadConfigReads": "Parallel thread setup reads",
        "keepUnsubscribedTurns": "Keep recent idle transcripts",
    ]
}
