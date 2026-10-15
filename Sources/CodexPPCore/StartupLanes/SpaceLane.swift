// The space lane of startup edits: the chunks its edits target and their
// labels in the helper menu. Its edits live in startup-adapter.js between the
// "space lane" markers.
extension StartupAdapter {
    static let spaceChunks: [StartupChunk] = [
        // The Page editor (comment highlights, the callout split filter).
        StartupChunk("pageContent", prefix: "content-", containing: ["spacePageCommentDecorations"]),
        // The Space sidebar (its page search).
        StartupChunk("spaceSidebar", prefix: "space-sidebar-", containing: ["space-search-result-"]),
        // The masonry grid of the Library, Space home and pinned pages.
        StartupChunk("libraryMasonry", prefix: "library-masonry-", containing: ["data-masonry-item"]),
    ]
}

extension StartupStatus {
    static let spaceLabels: [String: String] = [
        "pageBlockSerializedOnce": "Page lists serialised once per keystroke",
        "calloutFilterSkipsText": "Page callout check skips text",
        "sidebarSearchScorerOnce": "Space search matcher built once per word",
        "masonrySteadyObserver": "Library grid keeps one resize observer",
        "masonryUnchangedPositions": "Library grid skips unchanged positions",
    ]
}
