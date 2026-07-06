import type { DexVolume, VolumeResult } from "../types";
import { computeScore } from "../score";
import { getCachedVolume } from "../store";
import { fetchHyperliquidVolume } from "./hyperliquid";
import { fetchDydxVolume } from "./dydx";
import { fetchGmxVolume } from "./gmx";
import { privateDexPlaceholders } from "./private";
import { mergeVolumeResults } from "./merge";

export async function aggregateVolume(
  address: string,
  opts: { connected?: boolean; verified?: boolean; extra?: DexVolume[] } = {},
): Promise<VolumeResult> {
  const [hyperliquid, dydx, gmx] = await Promise.all([
    fetchHyperliquidVolume(address),
    fetchDydxVolume(address),
    fetchGmxVolume(address),
  ]);

  const privates = privateDexPlaceholders(Boolean(opts.connected));
  // Replace placeholders with any authenticated results passed in.
  const extras = new Map((opts.extra ?? []).map((d) => [d.dex, d]));
  const breakdown: DexVolume[] = [
    hyperliquid,
    dydx,
    gmx,
    ...privates.map((p) => extras.get(p.dex) ?? p),
  ];

  const totalVolumeUsd = breakdown.reduce(
    (sum, d) => (d.status === "ok" ? sum + d.volumeUsd : sum),
    0,
  );

  return {
    address,
    totalVolumeUsd,
    breakdown,
    score: computeScore(breakdown, totalVolumeUsd),
    verified: Boolean(opts.verified),
    fetchedAt: new Date().toISOString(),
  };
}

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address) || /^dydx1[a-z0-9]{38,58}$/.test(address);
}

/**
 * Combines volume across several wallets into one result (traders who use a
 * different wallet per DEX). Cache-first per address so a warm scan isn't
 * re-fetched; the first address is the combined result's primary identity.
 */
export async function aggregateAddresses(
  addresses: string[],
  opts: { verified?: boolean } = {},
): Promise<VolumeResult> {
  const unique = [...new Set(addresses.map((a) => a.trim()).filter(Boolean))];
  const results = await Promise.all(
    unique.map(async (addr) => {
      const cached =
        (await getCachedVolume(addr, true)) ??
        (await getCachedVolume(addr, false));
      return (
        cached ??
        aggregateVolume(addr, {
          connected: opts.verified,
          verified: opts.verified,
        })
      );
    }),
  );
  return mergeVolumeResults(results, unique[0]);
}

/** Splits a comma/space/newline-separated list of addresses. */
export function parseAddressList(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.filter((a): a is string => typeof a === "string");
  }
  if (typeof input === "string") {
    return input.split(/[\s,]+/).filter(Boolean);
  }
  return [];
}
