// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CodexPP",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "CodexPP", targets: ["CodexPP"])],
    targets: [
        .target(name: "CodexPPCore", resources: [.copy("Resources/acorn.js"), .copy("Resources/ACORN-LICENSE"), .copy("Resources/settings-adapter.js"), .copy("Resources/browser-adapter.js"), .copy("Resources/native-browser.js"), .copy("Resources/shell-adapter.js"), .copy("Resources/shell-runtime.js"), .copy("Resources/native-shell.js"), .copy("Resources/native-capture.js")]),
        .executableTarget(name: "CodexPP", dependencies: ["CodexPPCore"], resources: [.copy("Resources/runtime.js"), .copy("Resources/bridge.js"), .copy("Resources/settings.js"), .copy("Resources/native-settings.js")]),
        .testTarget(name: "CodexPPCoreTests", dependencies: ["CodexPPCore"])
    ]
)
