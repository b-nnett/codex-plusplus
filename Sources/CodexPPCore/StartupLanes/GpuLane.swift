// The gpu lane of startup edits: the chunks its edits target and their
// labels in the helper menu. Its edits live in startup-adapter.js between the
// "gpu lane" markers.
extension StartupAdapter {
    // Every edit is in app-initial ("initial", a core chunk); the two CSS
    // edits read the stylesheets the adapter already receives.
    static let gpuChunks: [StartupChunk] = []
}

extension StartupStatus {
    static let gpuLabels: [String: String] = [
        "readyPulseOpacity": "Compositor update-ready pulse",
        "blossomShimmerTransform": "Compositor loading-logo shimmer",
        "imageUploadOffThread": "Image upload resize in a worker",
    ]
}
