export type DexId =
  | "hyperliquid"
  | "aster"
  | "lighter"
  | "edgex"
  | "paradex"
  | "dydx"
  | "jupiter"
  | "gmx"
  | "drift"
  | "extended"
  | "pacifica"
  | "variational";

export type DexStatus =
  | "ok" // volume fetched
  | "no_account" // address has no account on this DEX
  | "auth_required" // needs wallet signature / connect wallet
  | "unsupported" // no public API available yet
  | "error"; // fetch failed

/** Extra on-chain activity signals a DEX fetcher managed to extract. */
export interface DexActivityStats {
  firstActivityMs?: number; // earliest observed activity timestamp
  lastActivityMs?: number; // latest observed activity timestamp
  activeDays?: number; // estimated distinct active trading days
  dayVolumeUsd?: number;
  weekVolumeUsd?: number;
  monthVolumeUsd?: number;
}

export interface DexVolume {
  dex: DexId;
  name: string;
  status: DexStatus;
  volumeUsd: number;
  note?: string;
  stats?: DexActivityStats;
}

/** Reputation tier on the 0–100 Trader Score scale. */
export interface Rank {
  id: string; // slug, also the /public/ranks/{id}.png asset name
  name: string;
  title: string;
  minScore: number; // inclusive lower bound
  color: string; // signature accent pulled from the rank artwork
  glow: string; // rgba() glow used for neon borders/shadows
}

export type MetricId =
  | "volume"
  | "tradingDays"
  | "walletAge"
  | "protocols"
  | "consistency"
  | "diversity"
  | "risk";

export interface MetricScore {
  id: MetricId;
  label: string;
  weight: number; // 0–1, all metrics sum to 1
  score: number; // 0–1 normalized
  display: string; // human-readable value ("$4.2M", "212 days", …)
  estimated: boolean; // true when derived from partial data
}

export interface TraderScore {
  total: number; // 0–100
  rank: Rank;
  next: Rank | null; // next tier up, null at Singularity
  toNext: number; // points to the next tier (0 at the top)
  metrics: MetricScore[];
}

export interface VolumeResult {
  address: string;
  totalVolumeUsd: number;
  breakdown: DexVolume[];
  score: TraderScore;
  verified: boolean; // true when looked up via connected wallet
  fetchedAt: string;
  cached?: boolean;
}

/** Connected X (Twitter) profile used to personalize cards. */
export interface XProfile {
  handle: string; // without the @
  name: string;
  avatar: string; // https URL
  // true only when the handle was proven via OAuth ("Sign in with X"). A
  // manually-typed handle is unverified and is never attributed on the public
  // leaderboard or share snapshots — anyone can type any handle.
  verified: boolean;
}

export interface ShareRecord {
  id: string;
  address: string;
  total_volume: number;
  breakdown_json: DexVolume[];
  hero_name: string; // rank name (column kept from the Poplytics schema)
  verified: boolean;
  created_at: string;
  x_handle?: string | null;
  x_name?: string | null;
  x_avatar?: string | null;
}

export interface LeaderboardEntry {
  address: string;
  total_volume: number;
  score: number;
  rank_name: string;
  x_handle?: string | null;
  x_name?: string | null;
  x_avatar?: string | null;
  updated_at: string;
}
