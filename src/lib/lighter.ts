/**
 * Client-side Lighter unlock flow.
 *
 * Lighter has no public per-wallet volume API — trade history is auth gated.
 * Reading it needs a short-lived auth token signed by the account's Lighter
 * API key (a zk-scheme key, not a plain wallet signature). So:
 *
 * 1. Resolve the wallet's Lighter `account_index` from the public account
 *    endpoint (no auth).
 * 2. Use the official SDK's WASM signer to mint an 8-hour read-only auth token
 *    from the user's API private key. The key stays in the browser and never
 *    reaches our server.
 * 3. Only the auth token + account index are POSTed to our backend, which sums
 *    the account's fills.
 *
 * The SDK (~14MB WASM) is dynamically imported so it only loads when the user
 * actually connects Lighter. The WASM assets are served from /public/lighter.
 */

const API = "https://mainnet.zklighter.elliot.ai/api/v1";
const WASM_PATH = "/lighter/lighter-signer.wasm";
const EIGHT_HOURS = 8 * 60 * 60;

export interface LighterUnlock {
  status: "ok" | "no_account" | "rejected" | "error";
  authToken?: string;
  accountIndex?: number;
  message?: string;
}

/** Public L1-address → account_index lookup (no auth). */
async function resolveAccountIndex(address: string): Promise<number | null> {
  const res = await fetch(
    `${API}/account?by=l1_address&value=${encodeURIComponent(address)}`,
    { signal: AbortSignal.timeout(15_000) },
  );
  const data: {
    code?: number;
    accounts?: { index: number }[];
  } = await res.json();
  if (data.code === 21100 || !data.accounts?.length) return null;
  return data.accounts[0].index;
}

export async function unlockLighter(params: {
  address: string;
  apiPrivateKey: string;
  apiKeyIndex: number;
}): Promise<LighterUnlock> {
  const { address, apiPrivateKey, apiKeyIndex } = params;

  let accountIndex: number | null;
  try {
    accountIndex = await resolveAccountIndex(address);
  } catch {
    return { status: "error", message: "Couldn't reach Lighter" };
  }
  if (accountIndex == null) {
    return { status: "no_account", message: "No Lighter account for this wallet" };
  }

  let signer: { close: () => Promise<void> } | null = null;
  try {
    const { SignerClient } = await import("lighter-ts-sdk");
    const client = new SignerClient({
      url: "https://mainnet.zklighter.elliot.ai",
      privateKey: apiPrivateKey.trim(),
      accountIndex,
      apiKeyIndex,
      wasmConfig: { wasmPath: WASM_PATH },
    });
    signer = client;
    await client.initialize();
    await client.ensureWasmClient();
    const authToken = await client.createAuthTokenWithExpiry(EIGHT_HOURS);
    return { status: "ok", authToken, accountIndex };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A wrong key / index fails signing rather than the wallet popup.
    return { status: "error", message: `Couldn't sign with that API key: ${msg}` };
  } finally {
    try {
      await signer?.close();
    } catch {
      // ignore cleanup failures
    }
  }
}
