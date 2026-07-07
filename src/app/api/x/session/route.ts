import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { X_COOKIE, X_COOKIE_MAX_AGE } from "@/lib/x";

export const runtime = "nodejs";

/**
 * POST /api/x/session  Body: { access_token }
 * Completes "Sign in with X" via Supabase Auth: verifies the session token
 * server-side, extracts the X profile from user_metadata, and stores it in
 * the perpid_x cookie. The Supabase session itself isn't kept — PerpID only
 * needs handle + name + avatar.
 */
export async function POST(req: NextRequest) {
  let body: { access_token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.access_token) {
    return NextResponse.json({ error: "Missing access_token" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 501 },
    );
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase.auth.getUser(body.access_token);
  if (error || !data.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const meta = data.user.user_metadata ?? {};
  // Twitter/X via Supabase: user_name = handle, avatar_url = 48px "_normal".
  const handle: string | undefined = meta.user_name ?? meta.preferred_username;
  if (!handle) {
    return NextResponse.json(
      { error: "No X handle on this account" },
      { status: 400 },
    );
  }

  const profile = {
    handle,
    name: (meta.full_name ?? meta.name ?? handle) as string,
    avatar: String(meta.avatar_url ?? meta.picture ?? "").replace(
      "_normal",
      "_400x400",
    ),
    // Proven via Supabase "Sign in with X" OAuth — safe to attribute publicly.
    verified: true,
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
