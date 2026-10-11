// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CodexPP",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "CodexPP", targets: ["CodexPP"])],
    targets: [
        .target(name: "CodexPPCore", resources: [.copy("Resources/acorn.js"), .copy("Resources/parser-runner.js"), .copy("Resources/ACORN-LICENSE"), .copy("Resources/settings-adapter.js"), .copy("Resources/browser-adapter.js"), .copy("Resources/native-browser.js"), .copy("Resources/bookmarks-adapter.js"), .copy("Resources/bookmarks-runtime.js"), .copy("Resources/native-bookmarks.js"), .copy("Resources/shell-adapter.js"), .copy("Resources/shell-runtime.js"), .copy("Resources/native-shell.js"), .copy("Resources/native-capture.js"), .copy("Resources/native-runtime.js"), .copy("Resources/renderer-runtime.js"), .copy("Resources/renderer-bridge.js"), .copy("Resources/app-tools-parent.mjs")]),
        .executableTarget(name: "CodexPP", dependencies: ["CodexPPCore"], exclude: ["Resources/runtime.js"], resources: [.copy("Resources/settings.js"), .copy("Resources/native-settings.js")]),
        .testTarget(name: "CodexPPCoreTests", dependencies: ["CodexPPCore"])
    ]
)
