import { NextRequest, NextResponse } from "next/server";
import { fetchParadexVolumeWithJwt } from "@/lib/dex/private";
import { fetchDydxVolume } from "@/lib/dex/dydx";
import { aggregateVolume, isValidAddress } from "@/lib/dex";
import { computeScore } from "@/lib/score";
import { getCachedVolume, setCachedVolume } from "@/lib/store";
import type { DexVolume } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/volume/private
 * Body: {
 *   address: string,
 *   paradexJwt?: string,       // from the one-signature Paradex unlock
 *   dydxAddress?: string,      // user's dydx1… address (public volume)
 * }
 *
 * Accepts auth material the client obtained (a wallet-signed token, or a
 * read-only API key the user pasted), fetches private-API volume, and merges
 * it with the public aggregation. Credentials are used for this request only
 * and never stored. Lighter / Aster / Variational have no public per-wallet
 * volume API and stay as honest placeholders.
 */
export async function POST(req: NextRequest) {
  let body: {
    address?: string;
    paradexJwt?: string;
    paradexNoAccount?: boolean;
    dydxAddress?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const address = body.address?.trim() ?? "";
  if (!isValidAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const extra: DexVolume[] = [];
  if (body.paradexJwt) {
    extra.push(await fetchParadexVolumeWithJwt(body.paradexJwt));
  } else if (body.paradexNoAccount) {
    extra.push({
      dex: "paradex",
      name: "Paradex",
      status: "no_account",
      volumeUsd: 0,
      note: "No Paradex account for this wallet",
    });
  }

  if (body.dydxAddress) {
    const dydx = body.dydxAddress.trim();
    if (!dydx.startsWith("dydx1")) {
      return NextResponse.json(
        { error: "Enter a valid dydx1… address" },
        { status: 400 },
      );
    }
    extra.push(await fetchDydxVolume(dydx));
  }

  // Additively merge the new private results into the wallet's existing
  // (cached) scan so multiple unlocks — e.g. Paradex then dYdX — stack
  // instead of overwriting each other.
  const baseResult =
    (await getCachedVolume(address, true)) ??
    (await aggregateVolume(address, { connected: true, verified: true }));

  const byDex = new Map<string, DexVolume>(
    baseResult.breakdown.map((d) => [d.dex, d]),
  );
  for (const e of extra) byDex.set(e.dex, e);
  const breakdown = [...byDex.values()];
  const totalVolumeUsd = breakdown.reduce(
    (sum, d) => (d.status === "ok" ? sum + d.volumeUsd : sum),
    0,
  );

  const result = {
    ...baseResult,
    breakdown,
    totalVolumeUsd,
    score: computeScore(breakdown, totalVolumeUsd),
    verified: true,
    fetchedAt: new Date().toISOString(),
  };
  await setCachedVolume(result);
  return NextResponse.json(result);
}
