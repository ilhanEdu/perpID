import type {
  DexActivityStats,
  DexVolume,
  MetricScore,
  TraderScore,
} from "./types";
import { formatUsd, nextRank, rankForScore } from "./ranks";

/**
 * The Trader Score engine. Pure and isomorphic: given a per-DEX breakdown it
 * produces the same 0–100 score on the server, the client, and share pages,
 * so cached/persisted results never need a schema migration.
 *
 * Weights follow the PerpID PRD. Metrics with no on-chain signal available
 * yet (only some DEXs expose history) fall back to partial credit derived
 * from the volume tier and are flagged `estimated` so the UI can say so.
 */

const WEIGHTS = {
  volume: 0.35,
  tradingDays: 0.2,
  walletAge: 0.15,
  protocols: 0.1,
  consistency: 0.1,
  diversity: 0.05,
  risk: 0.05,
} as const;

/** Fraction of the volume sub-score granted when a metric has no data. */
const FALLBACK_CREDIT = 0.35;

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/** Log-scale volume score: $1K → 0, ~$250M+ → 1. */
function volumeScore(totalUsd: number): number {
  if (totalUsd < 1000) return totalUsd > 0 ? 0.02 : 0;
  return clamp01((Math.log10(totalUsd) - 3) / 5.4);
}

/** Merge activity stats across every DEX that reported them. */
function mergeStats(breakdown: DexVolume[]): DexActivityStats & {
  hasStats: boolean;
} {
  const all = breakdown.filter((d) => d.status === "ok" && d.stats);
  const merged: DexActivityStats = {};
  for (const { stats } of all) {
    if (!stats) continue;
    if (stats.firstActivityMs) {
      merged.firstActivityMs = Math.min(
        merged.firstActivityMs ?? Infinity,
        stats.firstActivityMs,
      );
    }
    if (stats.lastActivityMs) {
      merged.lastActivityMs = Math.max(
        merged.lastActivityMs ?? 0,
        stats.lastActivityMs,
      );
    }
    merged.activeDays = (merged.activeDays ?? 0) + (stats.activeDays ?? 0);
    merged.weekVolumeUsd =
      (merged.weekVolumeUsd ?? 0) + (stats.weekVolumeUsd ?? 0);
    merged.monthVolumeUsd =
      (merged.monthVolumeUsd ?? 0) + (stats.monthVolumeUsd ?? 0);
  }
  return { ...merged, hasStats: all.length > 0 };
}

export function computeScore(
  breakdown: DexVolume[],
  totalVolumeUsd: number,
): TraderScore {
  const active = breakdown.filter((d) => d.status === "ok" && d.volumeUsd > 0);
  const stats = mergeStats(breakdown);
  const vScore = volumeScore(totalVolumeUsd);
  const fallback = FALLBACK_CREDIT * vScore;

  // 1. Lifetime volume — the anchor metric.
  const volume: MetricScore = {
    id: "volume",
    label: "Lifetime Volume",
    weight: WEIGHTS.volume,
    score: vScore,
    display: formatUsd(totalVolumeUsd),
    estimated: false,
  };

  // 2. Active trading days — full marks at ~1 year of activity.
  const days = stats.activeDays ?? 0;
  const tradingDays: MetricScore = {
    id: "tradingDays",
    label: "Active Trading Days",
    weight: WEIGHTS.tradingDays,
    score: stats.hasStats && days > 0 ? clamp01(days / 365) : fallback,
    display: stats.hasStats && days > 0 ? `${Math.round(days)} days` : "—",
    estimated: !stats.hasStats || days === 0,
  };

  // 3. Wallet age — full marks at 2 years since first observed activity.
  const ageDays = stats.firstActivityMs
    ? (Date.now() - stats.firstActivityMs) / DAY_MS
    : 0;
  const walletAge: MetricScore = {
    id: "walletAge",
    label: "Wallet Age",
    weight: WEIGHTS.walletAge,
    score: ageDays > 0 ? clamp01(ageDays / 730) : fallback,
    display:
      ageDays >= 365
        ? `${(ageDays / 365).toFixed(1)} years`
        : ageDays > 0
          ? `${Math.round(ageDays)} days`
          : "—",
    estimated: ageDays === 0,
  };

  // 4. Protocol coverage — full marks at 4+ venues.
  const protocols: MetricScore = {
    id: "protocols",
    label: "Protocols Traded",
    weight: WEIGHTS.protocols,
    score: clamp01(active.length / 4),
    display: `${active.length} of ${breakdown.length}`,
    estimated: false,
  };

  // 5. Consistency — is this trader still in the arena?
  const consistencyScore = stats.hasStats
    ? (stats.weekVolumeUsd ?? 0) > 0
      ? 1
      : (stats.monthVolumeUsd ?? 0) > 0
        ? 0.7
        : totalVolumeUsd > 0
          ? 0.2
          : 0
    : fallback;
  const consistency: MetricScore = {
    id: "consistency",
    label: "Trading Consistency",
    weight: WEIGHTS.consistency,
    score: consistencyScore,
    display: stats.hasStats
      ? (stats.weekVolumeUsd ?? 0) > 0
        ? "Active this week"
        : (stats.monthVolumeUsd ?? 0) > 0
          ? "Active this month"
          : "Dormant"
      : "—",
    estimated: !stats.hasStats,
  };

  // 6. Diversity — volume spread across venues (1 − Herfindahl index).
  let diversityScore = 0;
  if (active.length > 1 && totalVolumeUsd > 0) {
    const hhi = active.reduce(
      (sum, d) => sum + Math.pow(d.volumeUsd / totalVolumeUsd, 2),
      0,
    );
    diversityScore = clamp01((1 - hhi) / (1 - 1 / active.length));
  }
  const diversity: MetricScore = {
    id: "diversity",
    label: "Position Diversity",
    weight: WEIGHTS.diversity,
    score: diversityScore,
    display:
      active.length > 1 ? `${Math.round(diversityScore * 100)}%` : "Single venue",
    estimated: false,
  };

  // 7. Risk behavior — no cross-DEX signal yet; neutral credit for traders.
  const risk: MetricScore = {
    id: "risk",
    label: "Risk Behavior",
    weight: WEIGHTS.risk,
    score: totalVolumeUsd > 0 ? 0.5 : 0,
    display: "Coming soon",
    estimated: true,
  };

  const metrics = [
    volume,
    tradingDays,
    walletAge,
    protocols,
    consistency,
    diversity,
    risk,
  ];

  const total = Math.min(
    Math.round(metrics.reduce((sum, m) => sum + m.weight * m.score, 0) * 100),
    100,
  );
  const rank = rankForScore(total);
  const next = nextRank(rank);

  return {
    total,
    rank,
    next,
    toNext: next ? Math.max(next.minScore - total, 0) : 0,
    metrics,
  };
}
