import { NextRequest, NextResponse } from "next/server";
import {
  aggregateAddresses,
  isValidAddress,
  parseAddressList,
} from "@/lib/dex";
import { computeScore } from "@/lib/score";
import { tierForVolume } from "@/lib/tiers";
import { claimWallets, getLeaderboard, upsertLeaderboard } from "@/lib/store";
import { shortAddress } from "@/lib/ranks";
import { getXProfile } from "@/lib/x";

export const runtime = "nodejs";

/** GET /api/leaderboard — top wallets by lifetime volume. */
export async function GET() {
  const entries = await getLeaderboard(50);
  return NextResponse.json({ entries });
}

/**
 * POST /api/leaderboard
 * Body: { address?, addresses?: string[], verified? }
 * Records the caller on the leaderboard using the server-side scan for their
 * wallet(s) (so clients can't submit invented volume). Volume is combined
 * across all submitted wallets; the connected X profile personalizes the row.
 */
export async function POST(req: NextRequest) {
  let body: { address?: string; addresses?: string[]; verified?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const addresses = parseAddressList(body.addresses ?? body.address);
  if (!addresses.length || !addresses.every(isValidAddress)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const x = await getXProfile();

  // Enforce one-wallet ↔ one-X-account before recording anything.
  if (x?.handle) {
    const { conflict } = await claimWallets(addresses, x.handle);
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
  }

  const result = await aggregateAddresses(addresses, {
    verified: Boolean(body.verified),
  });

  const score =
    result.score ?? computeScore(result.breakdown, result.totalVolumeUsd);

  await upsertLeaderboard({
    address: result.address,
    total_volume: result.totalVolumeUsd,
    score: score.total,
    rank_name: tierForVolume(result.totalVolumeUsd).label,
    x_handle: x?.handle ?? null,
    x_name: x?.name ?? null,
    x_avatar: x?.avatar ?? null,
  });

  return NextResponse.json({ ok: true });
}
