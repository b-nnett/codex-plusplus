import XCTest
@testable import CodexPPCore

final class ProcessLivenessTests: XCTestCase {
    func testActualProcessExitDoesNotRequireWorkspaceNotifications() throws {
        XCTAssertTrue(ProcessLiveness.isAlive(ProcessInfo.processInfo.processIdentifier))
        XCTAssertFalse(ProcessLiveness.isAlive(0))
        XCTAssertFalse(ProcessLiveness.isAlive(-1))
        let child = Process(); child.executableURL = URL(fileURLWithPath: "/usr/bin/true")
        try child.run(); child.waitUntilExit()
        XCTAssertFalse(ProcessLiveness.isAlive(child.processIdentifier))
    }
}
