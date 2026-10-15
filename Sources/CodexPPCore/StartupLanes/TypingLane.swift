// The typing lane of startup edits: the chunks its edits target and their
// labels in the helper menu. Its edits live in startup-adapter.js between the
// "typing lane" markers.
extension StartupAdapter {
    static let typingChunks: [StartupChunk] = []
}

extension StartupStatus {
    static let typingLabels: [String: String] = [
        "composerSerializeOnce": "Composer drafts serialised once per edit",
        "composerTextOnce": "Composer text read once per edit",
        "composerPlainTextOnce": "Composer plain text converted once per edit",
        "composerLayoutPerFrame": "Composer overflow check once per frame",
    ]
}
