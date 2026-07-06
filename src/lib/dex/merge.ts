import type { DexActivityStats, DexVolume, VolumeResult } from "../types";
import { computeScore } from "../score";

/**
 * Merges several single-wallet volume results into one combined result — the
 * basis for connecting multiple wallets (traders who use a different wallet
 * per DEX). Per-DEX volumes are summed, activity stats unioned, and the
 * Trader Score recomputed from the combined breakdown.
 */

// When the same DEX appears across wallets, keep the most informative status.
const STATUS_RANK: Record<DexVolume["status"], number> = {
  ok: 5,
  auth_required: 4,
  no_account: 3,
  unsupported: 2,
  error: 1,
};

function min(a?: number, b?: number): number | undefined {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}
function max(a?: number, b?: number): number | undefined {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}
function sum(a?: number, b?: number): number | undefined {
  if (a == null && b == null) return undefined;
  return (a ?? 0) + (b ?? 0);
}

function mergeStats(
  a: DexActivityStats | undefined,
  b: DexActivityStats | undefined,
): DexActivityStats | undefined {
  if (!a) return b ? { ...b } : undefined;
  if (!b) return { ...a };
  return {
    firstActivityMs: min(a.firstActivityMs, b.firstActivityMs),
    lastActivityMs: max(a.lastActivityMs, b.lastActivityMs),
    activeDays: sum(a.activeDays, b.activeDays),
    dayVolumeUsd: sum(a.dayVolumeUsd, b.dayVolumeUsd),
    weekVolumeUsd: sum(a.weekVolumeUsd, b.weekVolumeUsd),
    monthVolumeUsd: sum(a.monthVolumeUsd, b.monthVolumeUsd),
  };
}

export function mergeVolumeResults(
  results: VolumeResult[],
  primaryAddress: string,
): VolumeResult {
  const byDex = new Map<string, DexVolume>();

  for (const res of results) {
    for (const row of res.breakdown) {
      const existing = byDex.get(row.dex);
      if (!existing) {
        byDex.set(row.dex, {
          ...row,
          volumeUsd: row.status === "ok" ? row.volumeUsd : 0,
          stats: row.stats ? { ...row.stats } : undefined,
        });
        continue;
      }
      if (row.status === "ok") existing.volumeUsd += row.volumeUsd;
      if (STATUS_RANK[row.status] > STATUS_RANK[existing.status]) {
        existing.status = row.status;
        existing.name = row.name;
        existing.note = row.note;
      }
      existing.stats = mergeStats(existing.stats, row.stats);
    }
  }

  const breakdown = [...byDex.values()];
  const totalVolumeUsd = breakdown.reduce(
    (s, d) => (d.status === "ok" ? s + d.volumeUsd : s),
    0,
  );

  return {
    address: primaryAddress,
    totalVolumeUsd,
    breakdown,
    score: computeScore(breakdown, totalVolumeUsd),
    verified: results.some((r) => r.verified),
    fetchedAt: new Date().toISOString(),
  };
}
