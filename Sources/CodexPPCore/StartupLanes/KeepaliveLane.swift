// The keepalive lane of startup edits: the chunks its edits target and their
// labels in the helper menu. Its edits live in startup-adapter.js between the
// "keepalive lane" markers.
extension StartupAdapter {
    static let keepaliveChunks: [StartupChunk] = []
}

extension StartupStatus {
    // retainRecentThreadViews is a development-only experiment (it is in the
    // adapter's developmentOnly set, so release builds skip it); labels are
    // for release edits only, which must all apply to the reviewed archive.
    static let keepaliveLabels: [String: String] = [:]
}
