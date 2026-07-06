/**
 * Client-side Paradex unlock flow — ONE wallet signature total.
 *
 * The official SDK's deriveFromEthSigner signs the same "STARK Key" message
 * twice purely as a wallet-determinism sanity check, which means two popups.
 * We derive the key ourselves from a single signature instead:
 *
 * 1. The wallet signs Paradex's "STARK Key" EIP-712 message once. That
 *    signature seeds the user's Paradex Starknet key — it never leaves the
 *    browser.
 * 2. The derived Starknet key signs a SNIP-12 auth request locally (no wallet
 *    popup) and exchanges it with Paradex's API for a short-lived JWT.
 * 3. Only the JWT is sent to our backend, which sums the user's fills.
 *
 * Everything is dynamically imported so starknet.js (~1MB) only loads when
 * the unlock actually runs.
 */

export interface ParadexUnlock {
  status: "ok" | "no_account" | "rejected" | "error";
  jwt?: string;
  message?: string;
}

const PARADEX_API = "https://api.prod.paradex.trade/v1";

type EthSignTypedData = (typedData: {
  domain: { name: string; version: string; chainId: string };
  primaryType: string;
  types: Record<string, Array<{ name: string; type: string }>>;
  message: Record<string, unknown>;
}) => Promise<string>;

/** Same shape the SDK's buildEthereumStarkKeyTypedData produces. */
function buildStarkKeyTypedData(ethereumChainId: string) {
  return {
    domain: { name: "Paradex", chainId: ethereumChainId, version: "1" },
    primaryType: "Constant",
    types: {
      Constant: [{ name: "action", type: "string" }],
    },
    message: { action: "STARK Key" },
  };
}

function buildAuthTypedData(
  paradexChainIdHex: string,
  timestamp: number,
  expiration: number,
) {
  return {
    domain: { name: "Paradex", chainId: paradexChainIdHex, version: "1" },
    primaryType: "Request",
    types: {
      StarkNetDomain: [
        { name: "name", type: "felt" },
        { name: "chainId", type: "felt" },
        { name: "version", type: "felt" },
      ],
      Request: [
        { name: "method", type: "felt" },
        { name: "path", type: "felt" },
        { name: "body", type: "felt" },
        { name: "timestamp", type: "felt" },
        { name: "expiration", type: "felt" },
      ],
    },
    message: {
      method: "POST",
      path: "/v1/auth",
      body: "",
      timestamp,
      expiration,
    },
  };
}

export async function unlockParadex(
  signTypedData: EthSignTypedData,
): Promise<ParadexUnlock> {
  try {
    const [{ fetchConfig }, starkwareCrypto, Starknet] = await Promise.all([
      import("@paradex/sdk/dist/config.js"),
      import("@starkware-industries/starkware-crypto-utils"),
      import("starknet"),
    ]);
    // CJS module — named exports may sit on .default depending on bundler.
    const keyDerivation =
      starkwareCrypto.keyDerivation ??
      (starkwareCrypto as unknown as { default?: typeof starkwareCrypto })
        .default?.keyDerivation;
    if (!keyDerivation) throw new Error("Key derivation module failed to load");

    const config = await fetchConfig("prod");

    // The single wallet popup of the whole flow.
    let seed: string;
    try {
      seed = await signTypedData(
        buildStarkKeyTypedData(String(config.ethereumChainId)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/rejected|denied|cancell?ed/i.test(msg)) {
        return { status: "rejected", message: "Signature request declined" };
      }
      return { status: "error", message: msg };
    }

    // Derive the Paradex Starknet account exactly like the SDK does —
    // minus its duplicate determinism-check signature.
    const privateKey = `0x${keyDerivation.getPrivateKeyFromEthSignature(seed)}`;
    const publicKey = `0x${keyDerivation.privateToStarkKey(privateKey)}`;
    const callData = Starknet.CallData.compile({
      implementation: config.paraclearAccountHash,
      selector: Starknet.hash.getSelectorFromName("initialize"),
      calldata: Starknet.CallData.compile({ signer: publicKey, guardian: "0" }),
    });
    const accountAddress = Starknet.hash.calculateContractAddressFromHash(
      publicKey,
      config.paraclearAccountProxyHash,
      callData,
      0,
    );

    const now = Math.floor(Date.now() / 1000);
    const expiration = now + 23 * 60 * 60;
    const chainIdHex = Starknet.shortString.encodeShortString(
      config.paradexChainId,
    );
    const typedData = buildAuthTypedData(chainIdHex, now, expiration);

    // Signed locally with the derived key — no wallet popup.
    const snSigner = new Starknet.Signer(privateKey);
    const signature = await snSigner.signMessage(typedData, accountAddress);
    const [r, s] = Array.isArray(signature)
      ? [BigInt(signature[0]).toString(), BigInt(signature[1]).toString()]
      : [signature.r.toString(), signature.s.toString()];

    const res = await fetch(`${PARADEX_API}/auth`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "PARADEX-STARKNET-ACCOUNT": accountAddress,
        "PARADEX-STARKNET-SIGNATURE": JSON.stringify([r, s]),
        "PARADEX-TIMESTAMP": String(now),
        "PARADEX-SIGNATURE-EXPIRATION": String(expiration),
      },
    });

    const data: { jwt_token?: string; message?: string; error?: string } =
      await res.json().catch(() => ({}));

    if (!res.ok || !data.jwt_token) {
      const msg = data.message ?? data.error ?? `Auth failed (${res.status})`;
      if (res.status === 404 || /not.?found|onboard/i.test(msg)) {
        return { status: "no_account", message: "No Paradex account found" };
      }
      return { status: "error", message: msg };
    }

    return { status: "ok", jwt: data.jwt_token };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unlock failed",
    };
  }
}
