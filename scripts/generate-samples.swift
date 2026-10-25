import AppKit

struct Row { let label: String; let value: String }

func drawText(_ text: String, x: CGFloat, y: CGFloat, size: CGFloat, color: NSColor = .black, bold: Bool = false) {
    let font = bold ? NSFont.boldSystemFont(ofSize: size) : NSFont.systemFont(ofSize: size)
    (text as NSString).draw(at: NSPoint(x: x, y: y), withAttributes: [.font: font, .foregroundColor: color])
}

func makeSample(title: String, subtitle: String, rows: [Row], file: String) {
    let width: CGFloat = 1200
    let height: CGFloat = 850
    let image = NSImage(size: NSSize(width: width, height: height))
    image.lockFocus()
    NSColor(calibratedRed: 0.96, green: 0.97, blue: 0.99, alpha: 1).setFill()
    NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()
    NSColor.white.setFill()
    NSBezierPath(roundedRect: NSRect(x: 58, y: 55, width: 1084, height: 740), xRadius: 20, yRadius: 20).fill()
    drawText("FICTIONAL SAMPLE — NOT A REAL PAYMENT", x: 95, y: 740, size: 17, color: .systemPurple, bold: true)
    drawText(title, x: 95, y: 680, size: 38, bold: true)
    drawText(subtitle, x: 95, y: 635, size: 22, color: .darkGray)
    NSColor(calibratedRed: 0.87, green: 0.89, blue: 0.93, alpha: 1).setStroke()
    let rule = NSBezierPath()
    rule.move(to: NSPoint(x: 95, y: 610))
    rule.line(to: NSPoint(x: 1105, y: 610))
    rule.stroke()
    for (index, row) in rows.enumerated() {
        let y = CGFloat(550 - index * 70)
        drawText("\(row.label): \(row.value)", x: 95, y: y, size: 27)
    }
    image.unlockFocus()
    guard let tiff = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else { fatalError("Could not render sample") }
    try! png.write(to: URL(fileURLWithPath: file))
}

makeSample(title: "Tuition payment confirmation", subtitle: "Payment status: Completed", rows: [
    Row(label: "Student ID", value: "S1234567"),
    Row(label: "Bank Account Number", value: "1234 5678 9012"),
    Row(label: "Payment Amount", value: "$1,234.56"),
    Row(label: "Email", value: "student@example.test"),
    Row(label: "Phone Number", value: "416-555-0142"),
    Row(label: "Home Address", value: "123 Fictional Lane"),
], file: "public/samples/tuition-payment.png")

makeSample(title: "Order inquiry screenshot", subtitle: "Order status: Processing", rows: [
    Row(label: "Order Number", value: "ORD-482913"),
    Row(label: "Payment Amount", value: "$89.50"),
    Row(label: "Email", value: "customer@example.test"),
    Row(label: "Home Address", value: "45 Example Road"),
    Row(label: "Phone Number", value: "647-555-0188"),
], file: "public/samples/order-inquiry.png")
