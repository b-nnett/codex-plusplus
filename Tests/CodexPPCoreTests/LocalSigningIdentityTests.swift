import XCTest
@testable import CodexPPCore

final class LocalSigningIdentityTests: XCTestCase {
    func testCertificatePinAndStableRequirementAcrossDifferentBuilds() throws {
        guard ProcessInfo.processInfo.environment["CODEXPP_TEST_LOCAL_SIGNING"] == "1" else { throw XCTSkip("Enable local Keychain signing integration with CODEXPP_TEST_LOCAL_SIGNING=1.") }
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("codexpp-signer-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let identity = try LocalSigningIdentity.resolve(support: root)
        XCTAssertEqual(try LocalSigningIdentity.resolve(support: root), identity)
        func command(_ args: [String]) throws -> String {
            let process = Process(); process.executableURL = URL(fileURLWithPath: "/usr/bin/codesign"); process.arguments = args
            let pipe = Pipe(); process.standardOutput = pipe; process.standardError = pipe
            try process.run()
            let output = pipe.fileHandleForReading.readDataToEndOfFile(); process.waitUntilExit()
            XCTAssertEqual(process.terminationStatus, 0, String(decoding: output, as: UTF8.self))
            return String(decoding: output, as: UTF8.self)
        }
        var requirements: [String] = []
        for version in ["one", "two"] {
            let bundle = root.appendingPathComponent("\(version).app"), contents = bundle.appendingPathComponent("Contents")
            try FileManager.default.createDirectory(at: contents.appendingPathComponent("MacOS"), withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: contents.appendingPathComponent("Resources"), withIntermediateDirectories: true)
            try FileManager.default.copyItem(at: URL(fileURLWithPath: "/usr/bin/true"), to: contents.appendingPathComponent("MacOS/Fixture"))
            let info: [String: String] = ["CFBundleIdentifier":"dev.codexpp.signing-fixture", "CFBundleExecutable":"Fixture", "CFBundlePackageType":"APPL", "CFBundleVersion":version]
            try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0).write(to: contents.appendingPathComponent("Info.plist"))
            try Data(version.utf8).write(to: contents.appendingPathComponent("Resources/version"))
            _ = try command(["--force", "--sign", identity, bundle.path])
            _ = try command(["--verify", "--deep", "--strict", bundle.path])
            let metadata = try command(["-d", "-r-", bundle.path])
            requirements.append(metadata.split(separator:"\n").first(where:{$0.contains("designated =>")}).map(String.init) ?? "")
        }
        XCTAssertFalse(requirements[0].isEmpty)
        XCTAssertEqual(requirements[0], requirements[1])
        XCTAssertFalse(requirements[0].contains("cdhash"))
        let file = root.appendingPathComponent("Patching/signing-identity.json")
        try Data("{\"fingerprint\":\"MISSING\"}".utf8).write(to: file)
        XCTAssertThrowsError(try LocalSigningIdentity.resolve(support: root))
    }
}
