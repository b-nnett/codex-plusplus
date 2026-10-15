/// A vendor chunk the startup adapter edits, passed to it under `key`.
struct StartupChunk: Sendable {
    let key: String
    let directory: String
    let prefix: String
    let markers: [String]
    init(_ key: String, in directory: String = "webview/assets", prefix: String, containing markers: [String] = []) {
        self.key = key; self.directory = directory; self.prefix = prefix; self.markers = markers
    }
}
