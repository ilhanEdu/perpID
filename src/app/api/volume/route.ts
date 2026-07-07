import { NextRequest, NextResponse } from "next/server";
import { aggregateVolume, isValidAddress } from "@/lib/dex";
import { computeScore } from "@/lib/score";
import { getCachedVolume, setCachedVolume } from "@/lib/store";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * GET /api/volume?address=0x...&verified=1&fresh=1
 * Volume lookup across all supported DEXs. `verified=1` is sent when the
 * lookup address is the connected wallet; verified and unverified results
 * are cached separately (24h).
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, "volume", 60, 60_000);
  if (limited) return limited;

  const address = req.nextUrl.searchParams.get("address")?.trim() ?? "";
  const verified = req.nextUrl.searchParams.get("verified") === "1";
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";

  if (!isValidAddress(address)) {
    return NextResponse.json(
      { error: "Provide a valid 0x... EVM address or dydx1... address" },
      { status: 400 },
    );
  }

  if (!fresh) {
    const cached = await getCachedVolume(address, verified);
    if (cached) {
      // Entries cached before the Trader Score era lack `score` — backfill.
      return NextResponse.json({
        ...cached,
        score:
          cached.score ?? computeScore(cached.breakdown, cached.totalVolumeUsd),
      });
    }
  }

  const result = await aggregateVolume(address, {
    connected: verified,
    verified,
  });
  await setCachedVolume(result);
  return NextResponse.json(result);
}
