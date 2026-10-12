// Prints the largest on-screen window of a process and the display scale as
// JSON, for cropping launch recordings. Bounds need no Screen Recording grant.
import AppKit
import CoreGraphics

guard CommandLine.arguments.count == 2, let pid = Int32(CommandLine.arguments[1]) else {
    FileHandle.standardError.write("usage: window-bounds <pid>\n".data(using: .utf8)!)
    exit(2)
}
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let candidates = windows.compactMap { info -> CGRect? in
    guard (info[kCGWindowOwnerPID as String] as? Int32) == pid, (info[kCGWindowLayer as String] as? Int) == 0,
          let bounds = info[kCGWindowBounds as String] as? NSDictionary,
          let rect = CGRect(dictionaryRepresentation: bounds) else { return nil }
    return rect
}
guard let window = candidates.max(by: { $0.width * $0.height < $1.width * $1.height }) else { exit(1) }
let screen = NSScreen.screens.first { $0.frame.contains(CGPoint(x: window.midX, y: window.midY)) } ?? NSScreen.main
let result: [String: Double] = [
    "x": window.minX, "y": window.minY, "width": window.width, "height": window.height,
    "scale": Double(screen?.backingScaleFactor ?? 2)
]
print(String(data: try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), encoding: .utf8)!)
