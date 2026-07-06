import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import type {
  DexVolume,
  LeaderboardEntry,
  ShareRecord,
  VolumeResult,
  XProfile,
} from "./types";

/**
 * Data layer for caching volume lookups (24h TTL) and persisting share
 * snapshots. Uses Supabase when NEXT_PUBLIC_SUPABASE_URL and a key
 * (SUPABASE_SERVICE_ROLE_KEY or the publishable/anon key) are configured;
 * otherwise falls back to in-memory maps so local dev works out of the box.
 *
 * Verified (wallet-connected) and unverified (pasted address) lookups are
 * cached separately so a pasted lookup can never surface a verified card.
 *
 * Expected tables (see supabase/schema.sql):
 *   volume_cache(cache_key text pk, result jsonb, fetched_at timestamptz)
 *   shares(id text pk, address text, total_volume numeric,
 *          breakdown_json jsonb, hero_name text, verified boolean,
 *          created_at timestamptz)
 */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let supabase: SupabaseClient | null | undefined;

function getSupabase(): SupabaseClient | null {
  if (supabase !== undefined) return supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  supabase = url && key ? createClient(url, key) : null;
  return supabase;
}

// Each route compiles into its own bundle with its own module instance, so
// the fallback maps must live on globalThis to be shared across routes.
const g = globalThis as unknown as {
  __popCache?: Map<string, VolumeResult>;
  __popShares?: Map<string, ShareRecord>;
  __popBoard?: Map<string, LeaderboardEntry>;
};
const memCache = (g.__popCache ??= new Map<string, VolumeResult>());
const memShares = (g.__popShares ??= new Map<string, ShareRecord>());
const memBoard = (g.__popBoard ??= new Map<string, LeaderboardEntry>());

function cacheKey(address: string, verified: boolean): string {
  return `${address.toLowerCase()}:${verified ? "v" : "u"}`;
}

export async function getCachedVolume(
  address: string,
  verified: boolean,
): Promise<VolumeResult | null> {
  const key = cacheKey(address, verified);
  const db = getSupabase();

  if (db) {
    const { data, error } = await db
      .from("volume_cache")
      .select("result, fetched_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (data && Date.now() - new Date(data.fetched_at).getTime() < CACHE_TTL_MS) {
      return { ...(data.result as VolumeResult), cached: true };
    }
    // On DB errors (e.g. schema not applied yet) fall through to memory.
    if (!error) return null;
    console.warn(`[store] volume_cache read failed: ${error.message}`);
  }

  const hit = memCache.get(key);
  if (hit && Date.now() - new Date(hit.fetchedAt).getTime() < CACHE_TTL_MS) {
    return { ...hit, cached: true };
  }
  return null;
}

export async function setCachedVolume(result: VolumeResult): Promise<void> {
  const key = cacheKey(result.address, result.verified);
  const db = getSupabase();
  if (db) {
    const { error } = await db
      .from("volume_cache")
      .upsert({ cache_key: key, result, fetched_at: result.fetchedAt });
    if (!error) return;
    console.warn(`[store] volume_cache write failed: ${error.message}`);
  }
  memCache.set(key, result);
}

export async function createShare(
  result: VolumeResult,
  x?: XProfile | null,
): Promise<ShareRecord> {
  const record: ShareRecord = {
    id: randomBytes(6).toString("base64url"),
    address: result.address,
    total_volume: result.totalVolumeUsd,
    breakdown_json: result.breakdown,
    hero_name: result.score.rank.name,
    verified: result.verified,
    created_at: new Date().toISOString(),
    x_handle: x?.handle ?? null,
    x_name: x?.name ?? null,
    x_avatar: x?.avatar ?? null,
  };

  const db = getSupabase();
  if (db) {
    const { error } = await db.from("shares").insert(record);
    if (!error) return record;
    // Degrade to memory (share survives until restart) rather than failing.
    console.warn(`[store] shares insert failed: ${error.message}`);
  }
  memShares.set(record.id, record);
  return record;
}

export async function getShare(id: string): Promise<ShareRecord | null> {
  const db = getSupabase();
  if (db) {
    const { data } = await db
      .from("shares")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (data) return data as ShareRecord;
  }
  return memShares.get(id) ?? null;
}

export async function upsertLeaderboard(
  entry: Omit<LeaderboardEntry, "updated_at">,
): Promise<void> {
  const record: LeaderboardEntry = {
    ...entry,
    address: entry.address.toLowerCase(),
    updated_at: new Date().toISOString(),
  };

  const db = getSupabase();
  if (db) {
    const { error } = await db
      .from("leaderboard")
      .upsert(record, { onConflict: "address" });
    if (!error) return;
    console.warn(`[store] leaderboard upsert failed: ${error.message}`);
  }
  memBoard.set(record.address, record);
}

export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const db = getSupabase();
  if (db) {
    const { data, error } = await db
      .from("leaderboard")
      .select("*")
      .order("total_volume", { ascending: false })
      .limit(limit);
    if (!error && data) return data as LeaderboardEntry[];
    if (error) console.warn(`[store] leaderboard read failed: ${error.message}`);
  }
  return [...memBoard.values()]
    .sort((a, b) => b.total_volume - a.total_volume)
    .slice(0, limit);
}

export function shareToResult(share: ShareRecord): {
  address: string;
  totalVolumeUsd: number;
  breakdown: DexVolume[];
  verified: boolean;
} {
  return {
    address: share.address,
    totalVolumeUsd: Number(share.total_volume),
    breakdown: share.breakdown_json,
    verified: Boolean(share.verified),
  };
}
