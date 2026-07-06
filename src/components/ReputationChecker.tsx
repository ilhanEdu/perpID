"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import type { VolumeResult } from "@/lib/types";
import { unlockParadex } from "@/lib/paradex";
import { Dashboard } from "./Dashboard";
import { Icon } from "./Icons";

const SCAN_PROTOCOLS = [
  "Hyperliquid",
  "dYdX",
  "Lighter",
  "Paradex",
  "EdgeX",
  "Variational",
];

/** The "Analyzing your trading history…" sequence shown mid-lookup. */
function ScanProgress() {
  return (
    <div className="scan glass fade-up" role="status">
      <div className="scan-head">
        <span className="scan-radar">
          <Icon name="radar" size={22} />
        </span>
        <div>
          <div className="scan-title display">Analyzing your trading history</div>
          <div className="scan-sub">
            Aggregating on-chain perp activity across {SCAN_PROTOCOLS.length}{" "}
            protocols…
          </div>
        </div>
      </div>
      <div className="scan-rows">
        {SCAN_PROTOCOLS.map((name, i) => (
          <div
            className="scan-row"
            key={name}
            style={{ "--scan-delay": `${i * 0.5}s` } as React.CSSProperties}
          >
            <span className="scan-dot" />
            <span className="scan-name">{name}</span>
            <span className="scan-state mono">scanning…</span>
          </div>
        ))}
      </div>
      <div className="scan-beam" aria-hidden />
    </div>
  );
}

export function ReputationChecker() {
  const { address: walletAddress, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VolumeResult | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockNote, setUnlockNote] = useState<string | null>(null);

  // A lookup is "verified" only when it targets the connected wallet itself.
  const isVerifiedLookup = useCallback(
    (address: string) =>
      Boolean(
        isConnected &&
          walletAddress &&
          walletAddress.toLowerCase() === address.toLowerCase(),
      ),
    [isConnected, walletAddress],
  );

  const lookup = useCallback(
    async (address: string, fresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ address });
        if (isVerifiedLookup(address)) params.set("verified", "1");
        if (fresh) params.set("fresh", "1");
        const res = await fetch(`/api/volume?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Lookup failed");
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Lookup failed");
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [isVerifiedLookup],
  );

  // Sync the input to a freshly connected wallet during render, then let the
  // effect below run the lookup itself.
  const [lastWallet, setLastWallet] = useState<string | null>(null);
  if (isConnected && walletAddress && walletAddress !== lastWallet) {
    setLastWallet(walletAddress);
    setInput(walletAddress);
  }

  // Auto-lookup when a wallet connects. Deferred so no state updates happen
  // synchronously inside the effect; cancelled if the wallet changes first.
  useEffect(() => {
    if (!isConnected || !walletAddress) return;
    const timer = setTimeout(() => lookup(walletAddress), 0);
    return () => clearTimeout(timer);
  }, [isConnected, walletAddress, lookup]);

  const handleUnlock = useCallback(async () => {
    if (!result || unlocking) return;
    setUnlocking(true);
    setUnlockNote(null);
    try {
      // Adapt Paradex's typed-data shape to wagmi/viem's signer.
      const unlock = await unlockParadex((td) =>
        signTypedDataAsync({
          domain: {
            name: td.domain.name,
            version: td.domain.version,
            chainId: Number(td.domain.chainId),
          },
          types: td.types,
          primaryType: td.primaryType,
          message: td.message,
        } as Parameters<typeof signTypedDataAsync>[0]),
      );

      if (unlock.status === "rejected") {
        setUnlockNote("Signature declined — Paradex volume not unlocked.");
        return;
      }
      if (unlock.status === "error") {
        setUnlockNote(`Paradex unlock failed: ${unlock.message}`);
        return;
      }

      const res = await fetch("/api/volume/private", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: result.address,
          paradexJwt: unlock.jwt,
          paradexNoAccount: unlock.status === "no_account",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch volume");
      setResult(data);
      if (unlock.status === "no_account") {
        setUnlockNote("No Paradex account found for this wallet.");
      }
    } catch (err) {
      setUnlockNote(
        err instanceof Error ? err.message : "Paradex unlock failed",
      );
    } finally {
      setUnlocking(false);
    }
  }, [result, unlocking, signTypedDataAsync]);

  // One-shot flow: as soon as a verified lookup lands with Paradex still
  // locked, trigger the unlock automatically (once per address per session —
  // a declined signature doesn't re-prompt until the next visit).
  const autoUnlockAttempted = useRef<string | null>(null);
  useEffect(() => {
    if (!result?.verified) return;
    const paradexLocked = result.breakdown.some(
      (d) => d.dex === "paradex" && d.status === "auth_required",
    );
    if (!paradexLocked) return;
    if (autoUnlockAttempted.current === result.address.toLowerCase()) return;
    autoUnlockAttempted.current = result.address.toLowerCase();
    const timer = setTimeout(() => void handleUnlock(), 500);
    return () => clearTimeout(timer);
  }, [result, handleUnlock]);

  return (
    <>
      <div className="lookup neon-frame fade-up" id="scan">
        <div className="lookup-inner">
          <form
            className="lookup-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) lookup(input.trim());
            }}
          >
            <label className="sr-only" htmlFor="address-input">
              Wallet address
            </label>
            <input
              id="address-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="0x… or dydx1… address"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !input.trim()}
            >
              {loading ? "Scanning…" : "Generate Reputation"}
            </button>
          </form>
          <p className="lookup-hint">
            Paste any address for an <strong>unverified</strong> profile from
            public APIs — no wallet needed. Or connect your wallet for a{" "}
            <strong>✓ verified</strong> Trader Score with private-API volume
            unlocked. One quick signature, ever.
          </p>
          {error && <p className="error-text">{error}</p>}
        </div>
      </div>

      {loading && <ScanProgress />}

      {result && !loading && (
        <>
          <Dashboard
            result={result}
            onRefresh={() => lookup(result.address, true)}
          />

          {result.verified &&
            (unlocking || unlockNote !== null) &&
            result.breakdown.some(
              (d) => d.dex === "paradex" && d.status === "auth_required",
            ) && (
              <div className="unlock-panel glass">
                <div>
                  <div className="dex-name">
                    {unlocking
                      ? "Unlocking Paradex — check your wallet"
                      : "Paradex volume locked"}
                  </div>
                  <div className="dex-note">
                    {unlocking
                      ? "Approve the single signature prompt. Your key is derived in-browser — only a temporary read token leaves your device."
                      : "Signature declined or interrupted — retry to include Paradex in your Trader Score (one signature)."}
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleUnlock}
                  disabled={unlocking}
                >
                  {unlocking ? "Waiting…" : "Retry"}
                </button>
              </div>
            )}
          {unlockNote && <p className="hint-text">{unlockNote}</p>}
        </>
      )}
    </>
  );
}
