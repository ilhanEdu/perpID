import type { TraderScore, VolumeResult } from "./types";

/**
 * Achievement definitions — evaluated client/server-side from a volume
 * result. `icon` keys map to the SVG set in components/Icons.tsx.
 */
export interface Achievement {
  id: string;
  icon: string;
  name: string;
  requirement: string;
  unlocked: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function evaluateAchievements(
  result: Pick<VolumeResult, "breakdown" | "totalVolumeUsd" | "verified">,
  score: TraderScore,
): Achievement[] {
  const active = result.breakdown.filter(
    (d) => d.status === "ok" && d.volumeUsd > 0,
  );
  const firstTs = Math.min(
    ...result.breakdown.map((d) => d.stats?.firstActivityMs ?? Infinity),
  );
  const ageDays = Number.isFinite(firstTs)
    ? (Date.now() - firstTs) / DAY_MS
    : 0;
  const activeDays = result.breakdown.reduce(
    (sum, d) => sum + (d.stats?.activeDays ?? 0),
    0,
  );
  const weekVol = result.breakdown.reduce(
    (sum, d) => sum + (d.stats?.weekVolumeUsd ?? 0),
    0,
  );

  return [
    {
      id: "first-blood",
      icon: "zap",
      name: "First Blood",
      requirement: "$1K+ lifetime volume",
      unlocked: result.totalVolumeUsd >= 1_000,
    },
    {
      id: "six-figures",
      icon: "trend",
      name: "Six Figures",
      requirement: "$100K+ lifetime volume",
      unlocked: result.totalVolumeUsd >= 100_000,
    },
    {
      id: "volume-beast",
      icon: "flame",
      name: "Volume Beast",
      requirement: "$10M+ lifetime volume",
      unlocked: result.totalVolumeUsd >= 10_000_000,
    },
    {
      id: "whale",
      icon: "crown",
      name: "Whale",
      requirement: "$100M+ lifetime volume",
      unlocked: result.totalVolumeUsd >= 100_000_000,
    },
    {
      id: "explorer",
      icon: "globe",
      name: "Explorer",
      requirement: "Trade on 3+ protocols",
      unlocked: active.length >= 3,
    },
    {
      id: "veteran",
      icon: "clock",
      name: "Veteran",
      requirement: "Wallet older than 2 years",
      unlocked: ageDays >= 730,
    },
    {
      id: "diamond-hands",
      icon: "diamond",
      name: "Diamond Hands",
      requirement: "90+ active trading days",
      unlocked: activeDays >= 90,
    },
    {
      id: "in-the-arena",
      icon: "swords",
      name: "In the Arena",
      requirement: "Traded within the last 7 days",
      unlocked: weekVol > 0,
    },
    {
      id: "verified",
      icon: "shield",
      name: "Verified Identity",
      requirement: "Connect your wallet",
      unlocked: result.verified,
    },
    {
      id: "astral-walker",
      icon: "star",
      name: "Astral Walker",
      requirement: "Reach Trader Score 70",
      unlocked: score.total >= 70,
    },
  ];
}
