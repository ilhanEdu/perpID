import type { DexActivityStats, DexVolume } from "../types";

const API = "https://api.hyperliquid.xyz/info";

type PortfolioPeriod = {
  vlm?: string;
  accountValueHistory?: [number, string][];
  pnlHistory?: [number, string][];
};
type PortfolioResponse = [string, PortfolioPeriod][];

/**
 * Hyperliquid exposes all-time traded volume publicly via the `portfolio`
 * info endpoint (the `vlm` field of the `allTime` period). The same call
 * also returns account-value history per period, which we mine for Trader
 * Score signals: wallet age, estimated active days, and recent volume.
 */
export async function fetchHyperliquidVolume(
  address: string,
): Promise<DexVolume> {
  const base: DexVolume = {
    dex: "hyperliquid",
    name: "Hyperliquid",
    status: "error",
    volumeUsd: 0,
  };

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "portfolio", user: address }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { ...base, note: `API returned ${res.status}` };
    }

    const data: PortfolioResponse = await res.json();
    const period = (name: string) =>
      data.find(([p]) => p === name)?.[1] as PortfolioPeriod | undefined;

    const allTime = period("allTime");
    const volume = Number(allTime?.vlm ?? 0);

    if (!Number.isFinite(volume) || volume === 0) {
      return { ...base, status: "no_account", note: "No trading history" };
    }

    return {
      ...base,
      status: "ok",
      volumeUsd: volume,
      stats: extractStats(allTime, period("month"), period("week")),
    };
  } catch {
    return { ...base, note: "Request failed" };
  }
}

function extractStats(
  allTime?: PortfolioPeriod,
  month?: PortfolioPeriod,
  week?: PortfolioPeriod,
): DexActivityStats | undefined {
  const history = allTime?.accountValueHistory ?? allTime?.pnlHistory;
  if (!history?.length) return undefined;

  const timestamps = history
    .map(([ts]) => Number(ts))
    .filter((ts) => Number.isFinite(ts) && ts > 0);
  if (timestamps.length === 0) return undefined;

  const firstActivityMs = Math.min(...timestamps);
  const lastActivityMs = Math.max(...timestamps);
  const spanDays = Math.max(
    (lastActivityMs - firstActivityMs) / 86_400_000,
    1,
  );
  // The all-time history is sampled; distinct sample days ≈ active days,
  // capped by the actual account life span.
  const sampleDays = new Set(
    timestamps.map((ts) => Math.floor(ts / 86_400_000)),
  ).size;

  return {
    firstActivityMs,
    lastActivityMs,
    activeDays: Math.round(Math.min(sampleDays, spanDays)),
    monthVolumeUsd: Number(month?.vlm ?? 0) || 0,
    weekVolumeUsd: Number(week?.vlm ?? 0) || 0,
  };
}
