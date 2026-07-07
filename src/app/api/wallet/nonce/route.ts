import { NextRequest, NextResponse } from "next/server";
import { isValidAddress } from "@/lib/dex";
import { rateLimit } from "@/lib/rateLimit";
import {
  NONCE_COOKIE,
  NONCE_MAX_AGE,
  buildVerifyMessage,
  newNonce,
} from "@/lib/walletAuth";

export const runtime = "nodejs";

/**
 * GET /api/wallet/nonce?address=0x...
 * Issues a one-time nonce (stored in an httpOnly cookie) and returns the exact
 * message the wallet should sign to prove it controls `address`.
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "wallet-nonce", 30, 60_000);
  if (limited) return limited;

  const address = req.nextUrl.searchParams.get("address")?.trim() ?? "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(address) || !isValidAddress(address)) {
    return NextResponse.json({ error: "Invalid EVM address" }, { status: 400 });
  }

  const nonce = newNonce();
  const res = NextResponse.json({ message: buildVerifyMessage(address, nonce) });
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: NONCE_MAX_AGE,
    path: "/",
  });
  return res;
}
