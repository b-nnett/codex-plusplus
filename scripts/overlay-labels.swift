// Draws transparent PNG overlay frames for an evidence clip: a label (top left)
// and a readout (top right) that changes over time, such as live CPU. Used by
// evidence-video.py because Homebrew's ffmpeg ships without drawtext.
//
// overlay-labels <dir> <width> <height> <fps> <duration> <label> <timeline.json>
// timeline.json: [[seconds, "readout text"], ...] sorted by time; empty for none.
import AppKit

let a = CommandLine.arguments
guard a.count == 8, let width = Int(a[2]), let height = Int(a[3]), let fps = Double(a[4]), let duration = Double(a[5]),
      let data = FileManager.default.contents(atPath: a[7]),
      let timeline = (try? JSONSerialization.jsonObject(with: data)) as? [[Any]] else {
    FileHandle.standardError.write("usage: overlay-labels dir width height fps duration label timeline.json\n".data(using: .utf8)!)
    exit(2)
}
let directory = URL(fileURLWithPath: a[1]), label = a[6]
let points: [(Double, String)] = timeline.compactMap { row in
    guard row.count == 2, let t = (row[0] as? NSNumber)?.doubleValue, let text = row[1] as? String else { return nil }
    return (t, text)
}
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

let unit = CGFloat(height) / 900
func attributes(_ size: CGFloat, monospaced: Bool = false) -> [NSAttributedString.Key: Any] {
    [.font: monospaced ? NSFont.monospacedDigitSystemFont(ofSize: size * unit, weight: .semibold) : NSFont.systemFont(ofSize: size * unit, weight: .semibold),
     .foregroundColor: NSColor.white]
}
func pill(_ text: String, _ attrs: [NSAttributedString.Key: Any], at origin: (CGSize) -> CGPoint) {
    let string = NSAttributedString(string: text, attributes: attrs)
    let size = string.size(), pad = 14 * unit
    let box = CGRect(origin: origin(CGSize(width: size.width + 2 * pad, height: size.height + pad)),
                     size: CGSize(width: size.width + 2 * pad, height: size.height + pad))
    NSColor.black.withAlphaComponent(0.72).setFill()
    NSBezierPath(roundedRect: box, xRadius: 10 * unit, yRadius: 10 * unit).fill()
    string.draw(at: CGPoint(x: box.minX + pad, y: box.minY + pad / 2))
}

let frames = Int((duration * fps).rounded(.up))
var next = 0
var readout: String?
for index in 0..<frames {
    let t = Double(index) / fps
    while next < points.count && points[next].0 <= t { readout = points[next].1; next += 1 }
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8,
                                     samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                                     bytesPerRow: 0, bitsPerPixel: 0) else { exit(1) }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let w = CGFloat(width), h = CGFloat(height), margin = 24 * unit
    pill(label, attributes(38)) { CGPoint(x: margin, y: h - margin - $0.height) }
    if let readout { pill(readout, attributes(40, monospaced: true)) { CGPoint(x: w - margin - $0.width, y: h - margin - $0.height) } }
    NSGraphicsContext.restoreGraphicsState()
    guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
    try png.write(to: directory.appendingPathComponent(String(format: "%05d.png", index)))
}
