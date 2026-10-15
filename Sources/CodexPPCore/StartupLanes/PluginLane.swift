// The plugin lane of startup edits: the chunks its edits target and their
// labels in the helper menu. Its edits live in startup-adapter.js between the
// "plugin lane" markers.
extension StartupAdapter {
    // chromeProfileScanBackoff edits the main-process bundle ("main", a core chunk).
    static let pluginChunks: [StartupChunk] = []
}

extension StartupStatus {
    static let pluginLabels: [String: String] = [
        "chromeProfileScanBackoff": "Chrome extension check backs off when access is denied",
    ]
}
