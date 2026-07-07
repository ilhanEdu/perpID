import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { recoverMessageAddress } from "viem";

/**
 * Wallet ownership proof. Connecting a wallet in the browser proves nothing to
 * the server — the address is just a string a client can invent. So before an
 * address counts toward a card, the leaderboard, or a wallet↔X binding, the
 * wallet must sign a server-issued nonce (SIWE-style personal_sign).
 *
 * Proven addresses are kept in an HMAC-signed httpOnly cookie so the client
 * can't forge the set. The server treats THIS cookie — never the request body
 * — as the source of truth for which wallets a caller controls.
 */

export const NONCE_COOKIE = "perpid_wnonce";
export const VERIFIED_COOKIE = "perpid_wallets";
export const NONCE_MAX_AGE = 60 * 10; // 10 minutes to sign
export const VERIFIED_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const MAX_WALLETS = 20;

function secret(): string {
  const s = process.env.PERPID_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    // Fail loud in prod rather than signing with a guessable key.
    throw new Error("PERPID_SESSION_SECRET must be set (>=16 chars) in production");
  }
  return "perpid-dev-secret-do-not-use-in-prod";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function newNonce(): string {
  return randomBytes(18).toString("base64url");
}

/** The exact message a wallet signs to prove ownership of `address`. */
export function buildVerifyMessage(address: string, nonce: string): string {
  return [
    "PerpID — prove wallet ownership",
    "",
    "Sign this message to prove you control this wallet. This is read-only:",
    "it never moves funds, approves tokens, or sends transactions.",
    "",
    `Wallet: ${address.toLowerCase()}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

/** Encode the proven-wallet set into a tamper-evident cookie value. */
export function encodeVerified(addresses: Iterable<string>): string {
  const list = [...new Set([...addresses].map((a) => a.toLowerCase()))].slice(
    0,
    MAX_WALLETS,
  );
  const payload = list.join(",");
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

function decodeVerified(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return new Set();
  const b64 = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(b64, "base64url").toString();
  } catch {
    return new Set();
  }
  if (!safeEqual(mac, sign(payload))) return new Set();
  return new Set(payload ? payload.split(",") : []);
}

/** The set of wallet addresses (lowercased) the caller has proven ownership of. */
export async function getVerifiedWallets(): Promise<Set<string>> {
  const raw = (await cookies()).get(VERIFIED_COOKIE)?.value;
  return decodeVerified(raw);
}

/**
 * Verify a wallet signature against the nonce we issued this session. Returns
 * true only when the recovered signer matches the claimed address.
 */
export async function verifyOwnership(
  address: string,
  signature: string,
): Promise<boolean> {
  const nonce = (await cookies()).get(NONCE_COOKIE)?.value;
  if (!nonce) return false;
  try {
    const recovered = await recoverMessageAddress({
      message: buildVerifyMessage(address, nonce),
      signature: signature as `0x${string}`,
    });
    return recovered.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}
