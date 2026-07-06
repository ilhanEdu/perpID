import { NextRequest, NextResponse } from "next/server";
import {
  aggregateAddresses,
  isValidAddress,
  parseAddressList,
} from "@/lib/dex";
import { claimWallets, createShare, getWalletsForHandle } from "@/lib/store";
import { getXProfile } from "@/lib/x";
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
  let body: { address?: string; addresses?: string[]; verified?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const verified = Boolean(body.verified);
  const addresses = parseAddressList(body.addresses ?? body.address);
  if (!addresses.length || !addresses.every(isValidAddress)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  // Personalize the card with the connected X profile, if any.
  const profile = await getXProfile();

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
