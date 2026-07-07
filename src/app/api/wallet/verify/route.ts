import { NextRequest, NextResponse } from "next/server";
import { isValidAddress } from "@/lib/dex";
import { rateLimit } from "@/lib/rateLimit";
import {
  NONCE_COOKIE,
  VERIFIED_COOKIE,
  VERIFIED_MAX_AGE,
  encodeVerified,
  getVerifiedWallets,
  verifyOwnership,
} from "@/lib/walletAuth";

export const runtime = "nodejs";

/**
 * POST /api/wallet/verify  Body: { address, signature }
 * Checks the signature against the nonce issued by /api/wallet/nonce and, on
 * success, adds the address to the caller's HMAC-signed proven-wallet cookie.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "wallet-verify", 30, 60_000);
  if (limited) return limited;

  let body: { address?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const address = body.address?.trim() ?? "";
  const signature = body.signature ?? "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address) || !isValidAddress(address)) {
    return NextResponse.json({ error: "Invalid EVM address" }, { status: 400 });
  }
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const ok = await verifyOwnership(address, signature);
  if (!ok) {
    return NextResponse.json(
      { error: "Signature did not match — please try again." },
      { status: 401 },
    );
  }

  const proven = await getVerifiedWallets();
  proven.add(address.toLowerCase());

  const res = NextResponse.json({ ok: true, verified: [...proven] });
  res.cookies.set(VERIFIED_COOKIE, encodeVerified(proven), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: VERIFIED_MAX_AGE,
    path: "/",
  });
  res.cookies.delete(NONCE_COOKIE); // one-time use
  return res;
}
