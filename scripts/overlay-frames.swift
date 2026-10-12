// Draws transparent PNG overlay frames for a launch clip: a label, a timer
// running from the launch instant, and an "interactive" stamp. Used by
// launch-video.py because Homebrew's ffmpeg ships without drawtext.
//
// overlay-frames <dir> <width> <height> <fps> <duration> <launchAt> <interactiveAt> <label> <stamp>
import AppKit

let a = CommandLine.arguments
guard a.count == 10, let width = Int(a[2]), let height = Int(a[3]), let fps = Double(a[4]),
      let duration = Double(a[5]), let launchAt = Double(a[6]), let interactiveAt = Double(a[7]) else {
    FileHandle.standardError.write("usage: overlay-frames dir width height fps duration launchAt interactiveAt label stamp\n".data(using: .utf8)!)
    exit(2)
}
let directory = URL(fileURLWithPath: a[1]), label = a[8], stamp = a[9]
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

let unit = CGFloat(height) / 900
func attributes(_ size: CGFloat, monospaced: Bool = false) -> [NSAttributedString.Key: Any] {
    [.font: monospaced ? NSFont.monospacedDigitSystemFont(ofSize: size * unit, weight: .semibold) : NSFont.systemFont(ofSize: size * unit, weight: .semibold),
     .foregroundColor: NSColor.white]
}
func pill(_ text: String, _ attrs: [NSAttributedString.Key: Any], at origin: (CGSize) -> CGPoint, color: NSColor) {
    let string = NSAttributedString(string: text, attributes: attrs)
    let size = string.size(), pad = 14 * unit
    let box = CGRect(origin: origin(CGSize(width: size.width + 2 * pad, height: size.height + pad)),
                     size: CGSize(width: size.width + 2 * pad, height: size.height + pad))
    color.setFill()
    NSBezierPath(roundedRect: box, xRadius: 10 * unit, yRadius: 10 * unit).fill()
    string.draw(at: CGPoint(x: box.minX + pad, y: box.minY + pad / 2))
}

let frames = Int((duration * fps).rounded(.up))
for index in 0..<frames {
    let t = Double(index) / fps
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8,
                                     samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                                     bytesPerRow: 0, bitsPerPixel: 0) else { exit(1) }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let w = CGFloat(width), h = CGFloat(height), margin = 24 * unit
    pill(label, attributes(38), at: { CGPoint(x: margin, y: h - margin - $0.height) }, color: NSColor.black.withAlphaComponent(0.7))
    let elapsed = max(0, min(t, interactiveAt) - launchAt)
    pill(String(format: "%.2f s", elapsed), attributes(46, monospaced: true),
         at: { CGPoint(x: w - margin - $0.width, y: h - margin - $0.height) }, color: NSColor.black.withAlphaComponent(0.7))
    if t >= interactiveAt {
        pill(stamp, attributes(52), at: { CGPoint(x: (w - $0.width) / 2, y: 40 * unit) },
             color: NSColor(calibratedRed: 0.10, green: 0.50, blue: 0.22, alpha: 0.92))
    }
    NSGraphicsContext.restoreGraphicsState()
    guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
    try png.write(to: directory.appendingPathComponent(String(format: "%05d.png", index)))
}
