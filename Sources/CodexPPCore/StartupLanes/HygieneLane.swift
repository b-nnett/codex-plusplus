// The hygiene lane of startup edits: the chunks its edits target and their
// labels in the helper menu. Its edits live in startup-adapter.js between the
// "hygiene lane" markers.
extension StartupAdapter {
    static let hygieneChunks: [StartupChunk] = [
        // Empty Trash in the Library.
        StartupChunk("libraryTrash", prefix: "library-empty-trash-", containing: ["`/pages/archived`"]),
    ]
}

extension StartupStatus {
    static let hygieneLabels: [String: String] = [
        "quietUnhandledBroadcasts": "Quieter IPC broadcast log",
        "benignResizeObserverNotice": "ResizeObserver notices not logged as errors",
        "knownConversationNotifications": "Thread updates only in windows that have the thread",
        "libraryTrashPaginationGuard": "Bounded Library Empty Trash listing",
    ]
}
