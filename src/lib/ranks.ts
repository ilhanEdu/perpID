import type { Rank } from "./types";

/**
 * The PerpID rank ladder — six tiers over the 0–100 Trader Score scale.
 * Artwork lives in /public/ranks/{id}.png (plus /public/ranks/sm/{id}.png
 * for OG images). Accent colors are sampled from each portrait.
 */
export const RANKS: Rank[] = [
  {
    id: "singularity",
    name: "Singularity",
    title: "Beyond the event horizon",
    minScore: 90,
    color: "#ff5d73",
    glow: "rgba(255, 93, 115, 0.55)",
  },
  {
    id: "astral",
    name: "Astral",
    title: "Charts orbit around you",
    minScore: 70,
    color: "#8f7bff",
    glow: "rgba(143, 123, 255, 0.55)",
  },
  {
    id: "tempest",
    name: "Tempest",
    title: "The storm the orderbook fears",
    minScore: 50,
    color: "#ffc94d",
    glow: "rgba(255, 201, 77, 0.5)",
  },
  {
    id: "phantom",
    name: "Phantom",
    title: "Strikes without a trace",
    minScore: 30,
    color: "#a855f7",
    glow: "rgba(168, 85, 247, 0.55)",
  },
  {
    id: "vanguard",
    name: "Vanguard",
    title: "First through every breakout",
    minScore: 10,
    color: "#38cfff",
    glow: "rgba(56, 207, 255, 0.5)",
  },
  {
    id: "initiate",
    name: "Initiate",
    title: "Every legend starts here",
    minScore: 0,
    color: "#6b8afd",
    glow: "rgba(107, 138, 253, 0.5)",
  },
];

/** Ranks from lowest to highest tier. */
export const RANKS_ASC = [...RANKS].reverse();

export function rankForScore(score: number): Rank {
  return RANKS.find((r) => score >= r.minScore) ?? RANKS[RANKS.length - 1];
}

export function nextRank(rank: Rank): Rank | null {
  const idx = RANKS.findIndex((r) => r.id === rank.id);
  return idx > 0 ? RANKS[idx - 1] : null;
}

export function rankImage(rank: Rank, small = false): string {
  return small ? `/ranks/sm/${rank.id}.png` : `/ranks/${rank.id}.png`;
}

export function formatUsd(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

export function shortAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
