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
  __popLinks?: Map<string, string>;
};
const memCache = (g.__popCache ??= new Map<string, VolumeResult>());
const memShares = (g.__popShares ??= new Map<string, ShareRecord>());
const memBoard = (g.__popBoard ??= new Map<string, LeaderboardEntry>());
const memLinks = (g.__popLinks ??= new Map<string, string>());

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

/**
 * Returns the X handle each of the given wallets is bound to (lowercased
 * address → handle). Only bound wallets appear in the result. If the
 * wallet_links table isn't present yet, degrades to the in-memory map.
 */
export async function getWalletOwners(
  addresses: string[],
): Promise<Map<string, string>> {
  const lowers = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const out = new Map<string, string>();
  if (!lowers.length) return out;

  const db = getSupabase();
  if (db) {
    const { data, error } = await db
      .from("wallet_links")
      .select("address, x_handle")
      .in("address", lowers);
    if (!error && data) {
      for (const r of data as { address: string; x_handle: string }[]) {
        out.set(r.address, r.x_handle);
      }
      return out;
    }
    // Table missing / read error — fall through to memory (no hard failure).
    if (error) console.warn(`[store] wallet_links read failed: ${error.message}`);
  }
  for (const a of lowers) {
    const h = memLinks.get(a);
    if (h) out.set(a, h);
  }
  return out;
}

/** Every wallet address (lowercased) that the given X handle has linked. */
export async function getWalletsForHandle(handle: string): Promise<string[]> {
  if (!handle) return [];
  const db = getSupabase();
  if (db) {
    // Handles are stored lowercased, so an exact `=` gives case-insensitive
    // matching WITHOUT ILIKE treating `_` (legal in handles) as a wildcard.
    const { data, error } = await db
      .from("wallet_links")
      .select("address")
      .eq("x_handle", handle.toLowerCase());
    if (!error && data) {
      return (data as { address: string }[]).map((r) => r.address);
    }
    if (error)
      console.warn(`[store] wallet_links by handle read failed: ${error.message}`);
  }
  const out: string[] = [];
  const target = handle.toLowerCase();
  for (const [address, h] of memLinks) {
    if (h.toLowerCase() === target) out.push(address);
  }
  return out;
}

/** Binds any not-yet-linked wallets to a handle (first-come; never overwrites). */
export async function bindWallets(
  addresses: string[],
  handle: string,
): Promise<void> {
  const lowers = [...new Set(addresses.map((a) => a.toLowerCase()))];
  if (!lowers.length || !handle) return;

  const db = getSupabase();
  if (db) {
    const norm = handle.toLowerCase();
    const rows = lowers.map((address) => ({ address, x_handle: norm }));
    // ignoreDuplicates → keep the existing owner for already-linked wallets.
    const { error } = await db
      .from("wallet_links")
      .upsert(rows, { onConflict: "address", ignoreDuplicates: true });
    if (!error) return;
    console.warn(`[store] wallet_links write failed: ${error.message}`);
  }
  for (const a of lowers) if (!memLinks.has(a)) memLinks.set(a, handle.toLowerCase());
}

/**
 * Enforces the one-wallet ↔ one-X-account rule. If any wallet is already
 * linked to a *different* handle, returns that conflict (and binds nothing);
 * otherwise binds the caller's newly-linked wallets and returns no conflict.
 */
export async function claimWallets(
  addresses: string[],
  handle: string,
): Promise<{ conflict?: { address: string; owner: string } }> {
  if (!handle) return {};
  const owners = await getWalletOwners(addresses);
  for (const [address, owner] of owners) {
    if (owner.toLowerCase() !== handle.toLowerCase()) {
      return { conflict: { address, owner } };
    }
  }
  await bindWallets(addresses, handle);
  return {};
}

export async function upsertLeaderboard(
  entry: Omit<LeaderboardEntry, "updated_at">,
): Promise<void> {
  const address = entry.address.toLowerCase();
  const record: LeaderboardEntry = {
    ...entry,
    address,
    // Store lowercased so handle matching uses `=` (see getWalletsForHandle).
    x_handle: entry.x_handle ? entry.x_handle.toLowerCase() : entry.x_handle,
    updated_at: new Date().toISOString(),
  };

  const db = getSupabase();
  if (db) {
    if (record.x_handle) {
      // One identity per X account: an account can link several wallets, but
      // owns a single leaderboard row. Drop any rows this handle previously
      // held under a different wallet so its cumulative row is the only one.
      const { error: delErr } = await db
        .from("leaderboard")
        .delete()
        .eq("x_handle", record.x_handle)
        .neq("address", address);
      if (delErr)
        console.warn(`[store] leaderboard dedupe failed: ${delErr.message}`);
    } else {
      // Never let a submission without an X profile wipe an existing owner's
      // identity — keep the linked handle/name/avatar, only refresh the numbers.
      const { data } = await db
        .from("leaderboard")
        .select("x_handle, x_name, x_avatar")
        .eq("address", address)
        .maybeSingle();
      if (data?.x_handle) {
        record.x_handle = data.x_handle;
        record.x_name = data.x_name;
        record.x_avatar = data.x_avatar;
      }
    }
    const { error } = await db
      .from("leaderboard")
      .upsert(record, { onConflict: "address" });
    if (!error) return;
    console.warn(`[store] leaderboard upsert failed: ${error.message}`);
  }
  if (record.x_handle) {
    const target = record.x_handle.toLowerCase();
    for (const [addr, e] of memBoard) {
      if (addr !== address && e.x_handle?.toLowerCase() === target) {
        memBoard.delete(addr);
      }
    }
  } else {
    const existing = memBoard.get(address);
    if (existing?.x_handle) {
      record.x_handle = existing.x_handle;
      record.x_name = existing.x_name;
      record.x_avatar = existing.x_avatar;
    }
  }
  memBoard.set(address, record);
}

/**
 * Collapses rows that belong to the same X account into one, keeping the
 * highest-volume row per handle. A single X user can link several wallets
 * (each its own address-keyed row), but should appear on the board only once.
 * Rows without an X handle stay distinct (keyed by address). Input must be
 * pre-sorted by total_volume descending so the first row seen per handle wins.
 */
function dedupeByHandle(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const seen = new Set<string>();
  const out: LeaderboardEntry[] = [];
  for (const entry of entries) {
    const handle = entry.x_handle?.toLowerCase();
    if (handle) {
      if (seen.has(handle)) continue;
      seen.add(handle);
    }
    out.push(entry);
  }
  return out;
}

export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const db = getSupabase();
  if (db) {
    // Over-fetch so dedupe by handle still leaves a full page of `limit` rows.
    const { data, error } = await db
      .from("leaderboard")
      .select("*")
      .order("total_volume", { ascending: false })
      .limit(limit * 4);
    if (!error && data) {
      return dedupeByHandle(data as LeaderboardEntry[]).slice(0, limit);
    }
    if (error) console.warn(`[store] leaderboard read failed: ${error.message}`);
  }
  const sorted = [...memBoard.values()].sort(
    (a, b) => b.total_volume - a.total_volume,
  );
  return dedupeByHandle(sorted).slice(0, limit);
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
