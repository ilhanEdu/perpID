import { NextRequest, NextResponse } from "next/server";
import {
  aggregateAddresses,
  isValidAddress,
  parseAddressList,
} from "@/lib/dex";
import { claimWallets, createShare, getWalletsForHandle } from "@/lib/store";
import { getXProfile } from "@/lib/x";
import { getVerifiedWallets } from "@/lib/walletAuth";
import { rateLimit } from "@/lib/rateLimit";
import { shortAddress } from "@/lib/ranks";

export const runtime = "nodejs";

/**
 * POST /api/share
 * Body: { address?: string, addresses?: string[], verified?: boolean }
 * Snapshots the combined volume across one or more wallets and returns a
 * share id for /share/{id}. Uses the cache when warm to avoid re-hitting
 * every DEX.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "share", 40, 60_000);
  if (limited) return limited;

  let body: { address?: string; addresses?: string[]; verified?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const submitted = parseAddressList(body.addresses ?? body.address).filter(
    isValidAddress,
  );
  // Only wallets the caller has PROVEN ownership of (signed nonce → cookie)
  // count. The request body can't be trusted to assert ownership, so a card
  // can never be built from someone else's address.
  const proven = await getVerifiedWallets();
  const addresses = submitted.filter((a) => proven.has(a.toLowerCase()));
  if (!addresses.length) {
    return NextResponse.json(
      { error: "No verified wallet — connect and sign to prove ownership." },
      { status: 401 },
    );
  }
  const verified = true;

  // Personalize the card with the connected X profile — but only an
  // OAuth-verified handle is trusted for public attribution.
  const xProfile = await getXProfile();
  const profile = xProfile?.verified ? xProfile : null;

  // The wallets to score. With an X account connected, the card mirrors the
  // leaderboard: cumulative across every wallet the account has ever linked.
  let scanAddresses = addresses;

  // Enforce one-wallet ↔ one-X-account: a wallet already linked to a
  // different X account can't be claimed here.
  if (profile?.handle) {
    const { conflict } = await claimWallets(addresses, profile.handle);
    if (conflict) {
      return NextResponse.json(
        {
          error: `Wallet ${shortAddress(conflict.address)} is already linked to @${conflict.owner}`,
          address: conflict.address,
          owner: conflict.owner,
        },
        { status: 409 },
      );
    }
    const owned = await getWalletsForHandle(profile.handle);
    // Dedupe case-insensitively, preferring the submitted form of each wallet.
    const seen = new Set(addresses.map((a) => a.toLowerCase()));
    scanAddresses = [...addresses, ...owned.filter((a) => !seen.has(a.toLowerCase()))];
  }

  const result = await aggregateAddresses(scanAddresses, { verified });

  try {
    const share = await createShare(result, profile);
    return NextResponse.json({ id: share.id, url: `/share/${share.id}` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create share" },
      { status: 500 },
    );
  }
}
