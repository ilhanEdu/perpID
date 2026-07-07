import { NextRequest, NextResponse } from "next/server";
import { X_COOKIE, X_COOKIE_MAX_AGE } from "@/lib/x";

export const runtime = "nodejs";

/**
 * GET /api/x/callback — completes the PKCE flow: exchanges the code for a
 * short-lived token, reads the profile, stores only {handle,name,avatar}
 * in a cookie, and drops the token.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const raw = req.cookies.get("perpid_x_oauth")?.value;
  const back = new URL("/", req.nextUrl.origin);

  const fail = (reason: string) => {
    back.searchParams.set("x_error", reason);
    const res = NextResponse.redirect(back);
    res.cookies.delete("perpid_x_oauth");
    return res;
  };

  if (!code || !state || !raw) return fail("missing_code");
  let stash: { verifier: string; state: string };
  try {
    stash = JSON.parse(raw);
  } catch {
    return fail("bad_state");
  }
  if (stash.state !== state) return fail("state_mismatch");

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.X_CLIENT_ID!,
      redirect_uri: `${req.nextUrl.origin}/api/x/callback`,
      code_verifier: stash.verifier,
    });
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    // Confidential clients must also send Basic auth.
    if (process.env.X_CLIENT_SECRET) {
      headers.Authorization = `Basic ${Buffer.from(
        `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`,
      ).toString("base64")}`;
    }

    const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenRes.ok) return fail(`token_${tokenRes.status}`);
    const token: { access_token?: string } = await tokenRes.json();
    if (!token.access_token) return fail("no_token");

    const meRes = await fetch(
      "https://api.x.com/2/users/me?user.fields=profile_image_url",
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!meRes.ok) return fail(`me_${meRes.status}`);
    const me: {
      data?: { username?: string; name?: string; profile_image_url?: string };
    } = await meRes.json();
    if (!me.data?.username) return fail("no_profile");

    const profile = {
      handle: me.data.username,
      name: me.data.name ?? me.data.username,
      // X returns the 48px "_normal" variant; request the 400px one.
      avatar: (me.data.profile_image_url ?? "").replace(
        "_normal",
        "_400x400",
      ),
      // Proven via direct X OAuth — safe to attribute publicly.
      verified: true,
    };

    const res = NextResponse.redirect(back);
    res.cookies.delete("perpid_x_oauth");
    res.cookies.set(X_COOKIE, JSON.stringify(profile), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: X_COOKIE_MAX_AGE,
      path: "/",
    });
    return res;
  } catch {
    return fail("exchange_failed");
  }
}
