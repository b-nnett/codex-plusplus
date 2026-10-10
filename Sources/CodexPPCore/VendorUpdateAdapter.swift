import Foundation
import Security

/// Future vendor releases are authenticated before discovering compatibility.
/// Structural discovery still fails closed if native or renderer contracts move.
enum VendorUpdateAdapter {
    static func authenticate(_ app: URL) throws {
        var code: SecStaticCode?
        var requirement: SecRequirement?
        let policy = "anchor apple generic and certificate leaf[subject.OU] = \"2DC432GLL2\" and identifier \"com.openai.codex\""
        guard SecStaticCodeCreateWithPath(app as CFURL, [], &code) == errSecSuccess, let code,
              SecRequirementCreateWithString(policy as CFString, [], &requirement) == errSecSuccess, let requirement,
              SecStaticCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSStrictValidate | kSecCSCheckAllArchitectures | kSecCSCheckNestedCode), requirement) == errSecSuccess else {
            throw PatchError.invalid("The downloaded app does not have a valid OpenAI signature. Automatic repatch has stopped; the app has been left closed.")
        }
    }
    static func discover(_ app: URL, info: [String: Any]) throws -> PatchAdapter {
        try authenticate(app)
        guard info["CFBundleIdentifier"] as? String == DesktopAppLocator.bundleIdentifier,
              let version = info["CFBundleShortVersionString"] as? String,
              let build = info["CFBundleVersion"] as? String,
              build.range(of: "^[0-9]{1,12}$", options: .regularExpression) != nil,
              let integrity = info["ElectronAsarIntegrity"] as? [String: Any] else {
            throw PatchError.invalid("The vendor update has an unsupported bundle contract.")
        }
        let archive = try AsarArchive(app.appendingPathComponent("Contents/Resources/app.asar"))
        let package = try JSONSerialization.jsonObject(with: archive.data(at: "package.json")) as? [String: Any]
        guard package?["name"] as? String == "openai-codex-electron",
              package?["main"] as? String == ".vite/build/early-bootstrap.js",
              let declared = integrity["Resources/app.asar"] as? [String: Any],
              declared["hash"] as? String == archive.headerHash else {
            throw PatchError.invalid("The authenticated update's bootstrap or archive integrity contract changed.")
        }
        let framework = app.appendingPathComponent("Contents/Frameworks/Codex Framework.framework/Versions/Current/Codex Framework").resolvingSymlinksInPath()
        guard framework.path.hasPrefix(app.path + "/Contents/Frameworks/"),
              try framework.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true else {
            throw PatchError.invalid("The update framework is not a regular file within the vendor bundle.")
        }
        let bytes = try Data(contentsOf: framework, options: .mappedIfSafe)
        // This native bridge is arm64 only. A different architecture needs its own adapter.
        guard bytes.count > 8, Array(bytes.prefix(8)) == [0xcf,0xfa,0xed,0xfe,0x0c,0x00,0x00,0x01] else {
            throw PatchError.invalid("The update is not a supported arm64 Electron framework.")
        }
        let offset = try NativeIntegrityDigest.discoverOffset(in: bytes, expected: NativeIntegrityDigest.dictionaryHash(integrity))
        return PatchAdapter(id: "chatgpt-macos-\(build)-v31", version: version, build: build,
            main: ".vite/build/early-bootstrap.js", mainHash: sha256(try archive.data(at: ".vite/build/early-bootstrap.js")),
            headerHash: archive.headerHash, frameworkPath: String(framework.path.dropFirst(app.path.count + 1)),
            frameworkHash: sha256(bytes), integrityOffset: offset, vendorAuthenticated: true)
    }
}
