import { NextRequest, NextResponse } from "next/server";
import { fetchParadexVolumeWithJwt } from "@/lib/dex/private";
import { fetchLighterVolumeWithAuth } from "@/lib/dex/lighter";
import { fetchDydxVolume } from "@/lib/dex/dydx";
import { aggregateVolume, isValidAddress } from "@/lib/dex";
import { computeScore } from "@/lib/score";
import { getCachedVolume, setCachedVolume } from "@/lib/store";
import { getVerifiedWallets } from "@/lib/walletAuth";
import { rateLimit } from "@/lib/rateLimit";
import type { DexVolume } from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/volume/private
 * Body: {
 *   address: string,
 *   paradexJwt?: string,        // from the one-signature Paradex unlock
 *   lighterAuth?: string,       // Lighter read-only auth token (client-minted)
 *   lighterAccountIndex?: number,
 *   dydxAddress?: string,       // user's dydx1… address (public volume)
 * }
 *
 * Accepts auth material the client obtained (a wallet-signed token, or a
 * read-only auth token minted in-browser from the user's API key), fetches
 * private-API volume, and merges it with the public aggregation. Credentials
 * are used for this request only and never stored. Aster / Variational have no
 * public per-wallet volume API and stay as honest placeholders.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "volume-private", 40, 60_000);
  if (limited) return limited;

  let body: {
    address?: string;
    paradexJwt?: string;
    paradexNoAccount?: boolean;
    lighterAuth?: string;
    lighterAccountIndex?: number;
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

  // The extra volume is folded into THIS wallet's cached result, so the caller
  // must have proven they own it — otherwise it becomes a way to graft dYdX /
  // Paradex volume onto a wallet the caller doesn't control.
  const proven = await getVerifiedWallets();
  if (!proven.has(address.toLowerCase())) {
    return NextResponse.json(
      { error: "Verify wallet ownership first." },
      { status: 401 },
    );
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

  if (body.lighterAuth && typeof body.lighterAccountIndex === "number") {
    extra.push(
      await fetchLighterVolumeWithAuth(body.lighterAccountIndex, body.lighterAuth),
    );
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
