import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { isOAuthConfigured } from "@/lib/x";

export const runtime = "nodejs";

/**
 * GET /api/x/login — starts the X OAuth 2.0 PKCE flow. Requires
 * X_CLIENT_ID (and X_CLIENT_SECRET for confidential clients) in env, with
 * {origin}/api/x/callback registered as the redirect URI in the X app.
 */
export async function GET(req: NextRequest) {
  if (!isOAuthConfigured()) {
    return NextResponse.json(
      { error: "X OAuth not configured — set X_CLIENT_ID" },
      { status: 501 },
    );
  }

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");

  const redirectUri = `${req.nextUrl.origin}/api/x/callback`;
  const auth = new URL("https://x.com/i/oauth2/authorize");
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("client_id", process.env.X_CLIENT_ID!);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("scope", "users.read tweet.read");
  auth.searchParams.set("state", state);
  auth.searchParams.set("code_challenge", challenge);
  auth.searchParams.set("code_challenge_method", "S256");

  const res = NextResponse.redirect(auth);
  res.cookies.set("perpid_x_oauth", JSON.stringify({ verifier, state }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
