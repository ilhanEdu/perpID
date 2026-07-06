import QRCode from "qrcode";

/**
 * Renders a QR code to a PNG data URL. Works both server-side (og-card,
 * node runtime) and in the browser (the live V3 card). Colored to match
 * the card: ink modules on a cream field.
 */
export async function qrDataUrl(text: string, size = 132): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark: "#16130cff", light: "#faf6ecff" },
  });
}
