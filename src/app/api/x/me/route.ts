import { NextRequest, NextResponse } from "next/server";
import {
  getXProfile,
  isOAuthConfigured,
  sanitizeHandle,
  unavatarUrl,
  X_COOKIE,
  X_COOKIE_MAX_AGE,
} from "@/lib/x";

export const runtime = "nodejs";

/** GET /api/x/me — current connected X profile (or null). */
export async function GET() {
  const profile = await getXProfile();
  return NextResponse.json({ profile, oauth: isOAuthConfigured() });
}

/**
 * POST /api/x/me  Body: { handle }
 * Manual fallback when X OAuth credentials aren't configured: stores the
 * handle with a keyless avatar lookup (unavatar.io).
 */
export async function POST(req: NextRequest) {
  let body: { handle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const handle = sanitizeHandle(body.handle ?? "");
  if (!handle) {
    return NextResponse.json(
      { error: "Enter a valid X handle (letters, numbers, _)" },
      { status: 400 },
    );
  }

  // Manually-typed handle: anyone can enter any handle, so it is UNVERIFIED and
  // only personalizes the local card — never attributed on public surfaces.
  const profile = {
    handle,
    name: handle,
    avatar: unavatarUrl(handle),
    verified: false,
  };
  const res = NextResponse.json({ profile });
  res.cookies.set(X_COOKIE, JSON.stringify(profile), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: X_COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}

/** DELETE /api/x/me — disconnect X. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(X_COOKIE);
  return res;
}
