/**
 * PerpID v3 tiers — simple, meme-native, volume-based.
 * Thresholds tuned so the design's examples hold: $61M is still a SHARK,
 * $89M is a WHALE.
 */
export interface Tier {
  id: "shrimp" | "fish" | "shark" | "whale";
  emoji: string;
  label: string;
  minUsd: number;
}

export const TIERS: Tier[] = [
  { id: "whale", emoji: "🐋", label: "WHALE", minUsd: 75_000_000 },
  { id: "shark", emoji: "🦈", label: "SHARK", minUsd: 10_000_000 },
  { id: "fish", emoji: "🐟", label: "FISH", minUsd: 100_000 },
  { id: "shrimp", emoji: "🦐", label: "SHRIMP", minUsd: 0 },
];

export function tierForVolume(volumeUsd: number): Tier {
  return TIERS.find((t) => volumeUsd >= t.minUsd) ?? TIERS[TIERS.length - 1];
}
