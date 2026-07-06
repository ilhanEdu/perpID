import type { DexVolume } from "../types";

const API = "https://mainnet.zklighter.elliot.ai/api/v1";

/**
 * Lighter maps L1 (EVM) addresses to internal account indices publicly, but
 * per-account trade history requires an authenticated session. We detect the
 * account so the UI can prompt for wallet auth.
 */
export async function fetchLighterVolume(address: string): Promise<DexVolume> {
  const base: DexVolume = {
    dex: "lighter",
    name: "Lighter",
    status: "error",
    volumeUsd: 0,
  };

  if (!address.startsWith("0x")) {
    return { ...base, status: "unsupported", note: "EVM addresses only" };
  }

  try {
    const res = await fetch(
      `${API}/account?by=l1_address&value=${encodeURIComponent(address)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    const data: {
      code?: number;
      accounts?: { index: number; total_order_count: number }[];
    } = await res.json();

    if (data.code === 21100 || !data.accounts?.length) {
      return { ...base, status: "no_account", note: "No Lighter account" };
    }

    const orders = data.accounts.reduce(
      (sum, a) => sum + (a.total_order_count ?? 0),
      0,
    );
    return {
      ...base,
      status: "auth_required",
      note: `Account found (${orders.toLocaleString()} orders) — volume needs Lighter session keys, coming soon`,
    };
  } catch {
    return { ...base, note: "Request failed" };
  }
}
