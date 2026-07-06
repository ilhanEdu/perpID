import type { DexVolume } from "../types";

const INDEXER = "https://indexer.dydx.trade/v4";

/**
 * dYdX v4 uses Cosmos-style `dydx1...` addresses; there is no public mapping
 * from an EVM address. When given a dydx1 address we use the indexer's
 * affiliates total_volume endpoint, which returns lifetime taker+maker volume.
 */
export async function fetchDydxVolume(address: string): Promise<DexVolume> {
  const base: DexVolume = {
    dex: "dydx",
    name: "dYdX v4",
    status: "error",
    volumeUsd: 0,
  };

  if (!address.startsWith("dydx1")) {
    return {
      ...base,
      status: "unsupported",
      note: "Paste a dydx1... address to include dYdX volume",
    };
  }

  try {
    const res = await fetch(
      `${INDEXER}/affiliates/total_volume?address=${encodeURIComponent(address)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (res.status === 404 || res.status === 400) {
      return { ...base, status: "no_account", note: "No dYdX account found" };
    }
    if (!res.ok) {
      // "wallet not found" errors come back as 500 with a JSON body
      const body = await res.text();
      if (body.includes("not found")) {
        return { ...base, status: "no_account", note: "No dYdX account found" };
      }
      return { ...base, note: `Indexer returned ${res.status}` };
    }

    const data: { totalVolume?: string | number } = await res.json();
    const volume = Number(data.totalVolume ?? 0);
    if (!Number.isFinite(volume)) return { ...base, note: "Bad response" };
    return { ...base, status: "ok", volumeUsd: volume };
  } catch {
    return { ...base, note: "Request failed" };
  }
}
