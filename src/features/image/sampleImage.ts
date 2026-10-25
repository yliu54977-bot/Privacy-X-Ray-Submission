/** Fictional local fixtures, never generated from user content. */
export async function sampleImage(kind: "tuition" | "order"): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 850;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sample image generation is unavailable.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1200, 850);
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 40px Arial";
  ctx.fillText(
    kind === "tuition"
      ? "FICTIONAL TUITION PAYMENT"
      : "FICTIONAL ORDER RECEIPT",
    65,
    90,
  );
  ctx.font = "30px Arial";
  const lines =
    kind === "tuition"
      ? [
          "Student ID: DEMO123456",
          "Bank account number: 000011112222",
          "Payment amount: $1250.00",
          "Email: student@example.com",
          "Home address: 123 Example Street",
          "Phone: 555-010-2345",
        ]
      : [
          "Order number: DEMO987654",
          "Email: customer@example.com",
          "Home address: 456 Example Avenue",
          "Phone: 555-010-6789",
        ];
  lines.forEach((line, i) => ctx.fillText(line, 65, 200 + i * 80));
  ctx.font = "22px Arial";
  ctx.fillStyle = "#64748b";
  ctx.fillText("FOR TESTING ONLY - NO REAL PERSONAL DATA", 65, 785);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Sample generation failed."))),
      "image/png",
    ),
  );
  return new File([blob], `fictional-${kind}.png`, { type: "image/png" });
}
