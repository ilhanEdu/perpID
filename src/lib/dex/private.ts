import type { DexVolume } from "../types";

/**
 * The rest of the top perp-DEX roster (per DeFiLlama perps rankings).
 * Only some venues expose wallet-keyed public volume APIs; the others are
 * listed honestly so the scan shows full coverage of the ecosystem:
 *
 *  - Paradex: private API, unlocked with ONE wallet signature (JWT).
 *  - Lighter: private API, unlocked with a Lighter API-key auth token.
 *  - Aster / edgeX / Extended: exchange-issued API keys only.
 *  - Jupiter / Drift / Pacifica: Solana wallets — EVM address can't map.
 *  - Variational: exchange-issued keys only.
 */
export function privateDexPlaceholders(connected: boolean): DexVolume[] {
  return [
    {
      dex: "paradex",
      name: "Paradex",
      status: "auth_required",
      volumeUsd: 0,
      note: connected
        ? "Approve the single wallet signature to include Paradex"
        : "Connect wallet — included automatically via one signature",
    },
    {
      dex: "lighter",
      name: "Lighter",
      status: "auth_required",
      volumeUsd: 0,
      note: connected
        ? "Add your Lighter API key to include Lighter volume"
        : "Connect wallet, then add a Lighter API key to include it",
    },
  ];
}

/**
 * Paradex fills sum — called with a JWT the client obtained by signing the
 * Paradex onboarding message. Sums notional (price * size) across all fills.
 */
export async function fetchParadexVolumeWithJwt(
  jwt: string,
): Promise<DexVolume> {
  const base: DexVolume = {
    dex: "paradex",
    name: "Paradex",
    status: "error",
    volumeUsd: 0,
  };

  try {
    let total = 0;
    let cursor: string | undefined;
    // Paradex paginates fills (max 100/page); cap pages defensively.
    for (let page = 0; page < 100; page++) {
      const url = new URL("https://api.prod.paradex.trade/v1/fills");
      url.searchParams.set("page_size", "100");
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${jwt}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 401) {
        return { ...base, status: "auth_required", note: "Token expired" };
      }
      if (!res.ok) return { ...base, note: `API returned ${res.status}` };

      const data: {
        results?: { price: string; size: string }[];
        next?: string | null;
      } = await res.json();

      for (const fill of data.results ?? []) {
        const notional = Number(fill.price) * Number(fill.size);
        if (Number.isFinite(notional)) total += notional;
      }
      if (!data.next || !data.results?.length) break;
      cursor = data.next;
    }

    return { ...base, status: "ok", volumeUsd: total };
  } catch {
    return { ...base, note: "Request failed" };
  }
}
