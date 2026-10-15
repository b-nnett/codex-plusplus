// The scrolling lane of startup edits: the chunks its edits target and their
// labels in the helper menu. Its edits live in startup-adapter.js between the
// "scrolling lane" markers.
extension StartupAdapter {
    static let scrollingChunks: [StartupChunk] = [
        // ThreadScrollLayout, which provides the thread scroll context.
        StartupChunk("threadScrollLayout", prefix: "thread-scroll-layout-", containing: ["isScrolledFromBottom"]),
    ]
}

extension StartupStatus {
    static let scrollingLabels: [String: String] = [
        "stableScrollContext": "Stable thread scroll context",
    ]
}
