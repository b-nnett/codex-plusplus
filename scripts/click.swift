import ApplicationServices
import CoreGraphics
import Foundation

// Posts a left click at global screen points: click <x> <y>. Needs the
// Accessibility permission of the process that runs it.
let arguments = CommandLine.arguments
guard arguments.count == 3, let x = Double(arguments[1]), let y = Double(arguments[2]) else {
    FileHandle.standardError.write(Data("usage: click x y\n".utf8)); exit(2)
}
guard AXIsProcessTrusted() else { FileHandle.standardError.write(Data("click: no Accessibility permission\n".utf8)); exit(1) }
let point = CGPoint(x: x, y: y)
for type in [CGEventType.mouseMoved, .leftMouseDown, .leftMouseUp] {
    CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    usleep(40_000)
}
