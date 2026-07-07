import type { DexVolume } from "../types";

const API = "https://mainnet.zklighter.elliot.ai/api/v1";

interface LighterTrade {
  usd_amount?: string;
  size?: string;
  price?: string;
}

/**
 * Lighter has no public per-wallet volume endpoint — trade history is auth
 * gated. The client mints a short-lived read-only auth token from the user's
 * Lighter API key (via the WASM signer, in-browser) and passes it here along
 * with the account index it resolved from the wallet's L1 address. We page
 * through /trades and sum each fill's notional (`usd_amount`).
 *
 * See src/lib/lighter.ts for the client-side unlock that produces `authToken`.
 */
export async function fetchLighterVolumeWithAuth(
  accountIndex: number,
  authToken: string,
): Promise<DexVolume> {
  const base: DexVolume = {
    dex: "lighter",
    name: "Lighter",
    status: "error",
    volumeUsd: 0,
  };

  if (!Number.isInteger(accountIndex) || accountIndex < 0) {
    return { ...base, status: "no_account", note: "No Lighter account" };
  }

  try {
    let total = 0;
    let cursor: string | undefined;
    // /trades pages at 100; cap pages defensively (mirrors the Paradex sum).
    for (let page = 0; page < 200; page++) {
      const url = new URL(`${API}/trades`);
      url.searchParams.set("account_index", String(accountIndex));
      url.searchParams.set("market_id", "255"); // all markets
      url.searchParams.set("sort_by", "timestamp");
      url.searchParams.set("sort_dir", "desc");
      url.searchParams.set("limit", "100");
      url.searchParams.set("auth", authToken); // schema-documented auth param
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 401 || res.status === 403) {
        return { ...base, status: "auth_required", note: "Token expired" };
      }
      if (!res.ok) return { ...base, note: `API returned ${res.status}` };

      const data: { trades?: LighterTrade[]; next_cursor?: string | null } =
        await res.json();

      const trades = data.trades ?? [];
      for (const t of trades) {
        const notional =
          t.usd_amount != null
            ? Number(t.usd_amount)
            : Number(t.price) * Number(t.size);
        if (Number.isFinite(notional)) total += notional;
      }
      if (!data.next_cursor || !trades.length) break;
      cursor = data.next_cursor;
    }

    if (total <= 0) {
      return { ...base, status: "no_account", note: "No Lighter trades" };
    }
    return { ...base, status: "ok", volumeUsd: total };
  } catch {
    return { ...base, note: "Request failed" };
  }
}
