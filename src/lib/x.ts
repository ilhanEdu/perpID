import { cookies } from "next/headers";
import type { XProfile } from "./types";

/**
 * X (Twitter) profile session helpers. The profile is stored in a plain
 * httpOnly cookie — it only personalizes cards and the leaderboard, so no
 * tokens are persisted after the OAuth exchange completes.
 */

export const X_COOKIE = "perpid_x";
export const X_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function isOAuthConfigured(): boolean {
  return Boolean(process.env.X_CLIENT_ID);
}

export async function getXProfile(): Promise<XProfile | null> {
  const jar = await cookies();
  const raw = jar.get(X_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as XProfile;
    if (!parsed.handle) return null;
    return {
      handle: String(parsed.handle).replace(/^@/, ""),
      name: String(parsed.name ?? parsed.handle),
      avatar: String(parsed.avatar ?? ""),
    };
  } catch {
    return null;
  }
}

export function sanitizeHandle(input: string): string | null {
  const handle = input.trim().replace(/^@/, "");
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : null;
}

/** Keyless avatar fallback used when a handle is entered manually. */
export function unavatarUrl(handle: string): string {
  return `https://unavatar.io/x/${handle}`;
}
