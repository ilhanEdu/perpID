/**
 * Canonical public origin for PerpID, used for OG images, share links and
 * QR codes. Reads NEXT_PUBLIC_APP_URL (set per environment) and falls back
 * to the production Vercel domain. Never has a trailing slash.
 */
export const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? "https://perpid.vercel.app"
).replace(/\/$/, "");

/** Absolute URL for a share card, e.g. https://perpid.vercel.app/share/abc. */
export function shareLink(id: string): string {
  return `${APP_URL}/share/${id}`;
}

/** Bare host shown on the card face, e.g. "perpid.vercel.app". */
export const APP_HOST = APP_URL.replace(/^https?:\/\//, "");
