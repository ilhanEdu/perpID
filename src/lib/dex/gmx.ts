import { getAddress } from "viem";
import type { DexVolume } from "../types";

/**
 * GMX v2 exposes per-account lifetime volume publicly via its Subsquid
 * GraphQL indexers (no keys, no signature). `accountStats` with
 * period="total" holds cumulative traded volume, scaled by 1e30 (GMX's USD
 * fixed-point). We sum across Arbitrum + Avalanche.
 */
const SQUIDS = [
  "https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql",
  "https://gmx.squids.live/gmx-synthetics-avalanche:prod/api/graphql",
];
const USD_DECIMALS = 1e30;

const QUERY = `query Vol($a: String!) {
  accountStats(where: { account_eq: $a, period_eq: "total" }, limit: 1) { volume }
}`;

async function chainVolume(url: string, account: string): Promise<number | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { a: account } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const json: { data?: { accountStats?: { volume: string }[] } } = await res.json();
  const raw = json.data?.accountStats?.[0]?.volume;
  if (!raw) return 0;
  try {
    return Number(BigInt(raw)) / USD_DECIMALS;
  } catch {
    return 0;
  }
}

export async function fetchGmxVolume(address: string): Promise<DexVolume> {
  const base: DexVolume = {
    dex: "gmx",
    name: "GMX",
    status: "error",
    volumeUsd: 0,
  };
  if (!address.startsWith("0x")) {
    return { ...base, status: "unsupported", note: "EVM addresses only" };
  }

  let account: string;
  try {
    account = getAddress(address); // GMX stores checksummed addresses
  } catch {
    return { ...base, status: "unsupported", note: "Invalid address" };
  }

  try {
    const results = await Promise.all(
      SQUIDS.map((url) => chainVolume(url, account)),
    );
    if (results.every((r) => r === null)) {
      return { ...base, note: "API error" };
    }
    const total = results.reduce<number>((sum, r) => sum + (r ?? 0), 0);
    if (total <= 0) {
      return { ...base, status: "no_account", note: "No GMX trades" };
    }
    return { ...base, status: "ok", volumeUsd: total };
  } catch {
    return { ...base, note: "Request failed" };
  }
}
