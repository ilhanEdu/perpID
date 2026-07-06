"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignTypedData } from "wagmi";
import type {
  DexVolume,
  LeaderboardEntry,
  VolumeResult,
  XProfile,
} from "@/lib/types";
import { formatUsd, shortAddress } from "@/lib/ranks";
import { tierForVolume } from "@/lib/tiers";
import { unlockParadex } from "@/lib/paradex";
import { V3_DEXES } from "@/lib/dexRoster";
import { mergeVolumeResults } from "@/lib/dex/merge";
import { shareLink } from "@/lib/appUrl";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { ConnectorIcon, WalletMark } from "@/components/WalletIcons";
import { V3Card } from "./V3Card";

type Step = "idle" | "scanning" | "signing" | "done" | "error";

const MEDALS = ["🥇", "🥈", "🥉"];

export function V3App() {
  // ---- X account ----
  const [xProfile, setXProfile] = useState<XProfile | null>(null);
  const [oauthAvailable, setOauthAvailable] = useState(false);
  const [askHandle, setAskHandle] = useState(false);
  const [handleInput, setHandleInput] = useState("");
  const [xError, setXError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/x/me")
      .then((r) => r.json())
      .then(async (d) => {
        setOauthAvailable(Boolean(d.oauth));
        if (d.profile) {
          setXProfile(d.profile);
          return;
        }
        // Returning from a Supabase "Sign in with X" redirect? Exchange the
        // session for our profile cookie, then drop the Supabase session.
        const supabase = getSupabaseBrowser();
        if (!supabase) return;
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/x/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: token }),
        });
        const out = await res.json();
        if (res.ok && out.profile) setXProfile(out.profile);
        await supabase.auth.signOut().catch(() => {});
      })
      .catch(() => {});
  }, []);

  /** Try Supabase's X provider; fall back to manual handle entry. */
  async function connectXViaSupabase() {
    setXError(null);
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setAskHandle(true);
      return;
    }
    // The authorize endpoint 400s (no redirect back) when the provider is
    // off — pre-check the public settings so users are never stranded.
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
        { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } },
      );
      const settings = await res.json();
      if (!settings?.external?.twitter) {
        setAskHandle(true);
        return;
      }
    } catch {
      setAskHandle(true);
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "twitter",
      options: { redirectTo: window.location.origin + "/" },
    });
    if (error) setAskHandle(true);
  }

  async function connectXManual() {
    setXError(null);
    const res = await fetch("/api/x/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: handleInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      setXError(data.error ?? "Could not connect X");
      return;
    }
    setXProfile(data.profile);
    setAskHandle(false);
  }

  async function disconnectX() {
    await fetch("/api/x/me", { method: "DELETE" });
    await getSupabaseBrowser()?.auth.signOut().catch(() => {});
    setXProfile(null);
  }

  // ---- Wallets + scan (supports multiple connected wallets) ----
  const { address, isConnected, connector } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { signTypedDataAsync } = useSignTypedData();

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VolumeResult | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Each connected wallet's individual scan, keyed by lowercase address.
  const perWallet = useRef<Map<string, VolumeResult>>(new Map());
  const [wallets, setWallets] = useState<string[]>([]);
  const [linkError, setLinkError] = useState<string | null>(null);
  const lastCardHandle = useRef<string | null>(null);

  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const refreshBoard = useCallback(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setBoard(d.entries ?? []))
      .catch(() => {});
  }, []);
  useEffect(refreshBoard, [refreshBoard]);

  /** Public scan → one optional Paradex signature → that wallet's result. */
  const scanWallet = useCallback(
    async (addr: string): Promise<VolumeResult> => {
      const res = await fetch(`/api/volume?address=${addr}&verified=1`);
      let data: VolumeResult = await res.json();
      if (!res.ok) {
        throw new Error(
          (data as unknown as { error?: string }).error ?? "Scan failed",
        );
      }
      const paradexLocked = data.breakdown.some(
        (d) => d.dex === "paradex" && d.status === "auth_required",
      );
      if (paradexLocked) {
        setStep("signing");
        try {
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
          if (unlock.status === "ok" || unlock.status === "no_account") {
            const pres = await fetch("/api/volume/private", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address: addr,
                paradexJwt: unlock.status === "ok" ? unlock.jwt : undefined,
                paradexNoAccount: unlock.status === "no_account",
              }),
            });
            if (pres.ok) data = await pres.json();
          }
        } catch {
          // Declined signature — continue with public data only.
        }
      }
      return data;
    },
    [signTypedDataAsync],
  );

  /** Recompute the combined card + leaderboard row from the given wallets. */
  const syncCardAndBoard = useCallback(
    async (list0: string[]) => {
      let list = list0;
      // The server rejects wallets already linked to a different X account;
      // drop each one and retry so the rest of the card still builds.
      for (let attempt = 0; attempt < 6; attempt++) {
        if (!list.length) {
          setResult(null);
          setCardId(null);
          return;
        }
        const results = list
          .map((a) => perWallet.current.get(a))
          .filter((r): r is VolumeResult => Boolean(r));
        setResult(mergeVolumeResults(results, list[0]));

        const shareRes = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: list, verified: true }),
        });
        const share = await shareRes.json().catch(() => ({}));

        if (shareRes.status === 409 && share.address) {
          const bad = String(share.address).toLowerCase();
          perWallet.current.delete(bad);
          list = [...perWallet.current.keys()];
          setWallets(list);
          setLinkError(
            share.error ?? "That wallet is already linked to another X account.",
          );
          continue; // rebuild without the conflicting wallet
        }

        if (shareRes.ok) setCardId(share.id);
        await fetch("/api/leaderboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: list, verified: true }),
        }).catch(() => {});
        refreshBoard();
        return;
      }
    },
    [refreshBoard],
  );

  /** Scan a newly connected wallet and fold it into the combined card. */
  const adding = useRef<Set<string>>(new Set());
  const addWallet = useCallback(
    async (addr: string) => {
      const lower = addr.toLowerCase();
      if (perWallet.current.has(lower) || adding.current.has(lower)) return;
      adding.current.add(lower);
      setStep("scanning");
      setError(null);
      setLinkError(null);
      try {
        const data = await scanWallet(addr);
        perWallet.current.set(lower, data);
        const list = [...perWallet.current.keys()];
        setWallets(list);
        await syncCardAndBoard(list);
        setStep("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Scan failed");
        setStep("error");
      } finally {
        adding.current.delete(lower);
      }
    },
    [scanWallet, syncCardAndBoard],
  );

  const removeWallet = useCallback(
    (addr: string) => {
      const lower = addr.toLowerCase();
      perWallet.current.delete(lower);
      const list = [...perWallet.current.keys()];
      setWallets(list);
      if (!list.length) {
        setResult(null);
        setCardId(null);
        setStep("idle");
      } else {
        void syncCardAndBoard(list);
      }
    },
    [syncCardAndBoard],
  );

  // Auto-scan whichever account the connected wallet exposes; switching
  // accounts in the extension folds each additional wallet into the card.
  useEffect(() => {
    if (!isConnected || !address) return;
    const id = setTimeout(() => void addWallet(address), 0);
    return () => clearTimeout(id);
  }, [isConnected, address, addWallet]);

  // ---- Extra-DEX unlock (dYdX address) ----
  // dYdX can't be read from the connected EVM wallet alone (Cosmos address);
  // the user supplies their dydx1… address and the server folds that public
  // volume into the primary wallet's cached result additively.
  const applyPrivate = useCallback(
    async (
      payload: Record<string, unknown>,
      dexId: string,
      onErr: (m: string) => void,
    ): Promise<boolean> => {
      const primary = wallets[0];
      if (!primary) {
        onErr("Connect a wallet first");
        return false;
      }
      try {
        const res = await fetch("/api/volume/private", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: primary, ...payload }),
        });
        const data: VolumeResult & { error?: string } = await res.json();
        if (!res.ok) {
          onErr(data.error ?? "Request failed");
          return false;
        }
        const row = data.breakdown?.find((d: DexVolume) => d.dex === dexId);
        if (!row || row.status !== "ok") {
          onErr(row?.note ?? "No volume found");
          return false;
        }
        perWallet.current.set(primary, data);
        await syncCardAndBoard([...perWallet.current.keys()]);
        return true;
      } catch {
        onErr("Request failed");
        return false;
      }
    },
    [wallets, syncCardAndBoard],
  );

  const [dydxOpen, setDydxOpen] = useState(false);
  const [dydxInput, setDydxInput] = useState("");
  const [dydxBusy, setDydxBusy] = useState(false);
  const [dydxErr, setDydxErr] = useState<string | null>(null);

  async function connectDydx() {
    if (!dydxInput.trim()) return;
    setDydxBusy(true);
    setDydxErr(null);
    const ok = await applyPrivate(
      { dydxAddress: dydxInput.trim() },
      "dydx",
      setDydxErr,
    );
    if (ok) {
      setDydxInput("");
      setDydxOpen(false);
    }
    setDydxBusy(false);
  }

  // "+ add another wallet" opens a picker of every available connector
  // (installed browser wallets via EIP-6963 + WalletConnect when configured).
  const [addOpen, setAddOpen] = useState(false);

  /** Connect a chosen wallet; its account is auto-scanned and stacked in. */
  function addViaConnector(c: (typeof connectors)[number]) {
    setAddOpen(false);
    connect({ connector: c });
  }

  /** Same wallet, different account — prompt the extension's account picker. */
  async function switchAccountInWallet() {
    setAddOpen(false);
    try {
      const provider = (await connector?.getProvider?.()) as
        | { request?: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
        | undefined;
      await provider?.request?.({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Wallet has no account picker — the user can switch accounts manually.
    }
  }

  function disconnectAll() {
    disconnect();
    perWallet.current.clear();
    adding.current.clear();
    setWallets([]);
    setResult(null);
    setCardId(null);
    setStep("idle");
    lastCardHandle.current = null;
  }

  // Refresh the snapshot + leaderboard row when X connects afterwards.
  useEffect(() => {
    if (!wallets.length || step !== "done") return;
    const handle = xProfile?.handle ?? null;
    if (lastCardHandle.current === handle) return;
    lastCardHandle.current = handle;
    void syncCardAndBoard(wallets);
  }, [wallets, step, xProfile, syncCardAndBoard]);

  // ---- Derived ----
  const primary = wallets[0] ?? null;
  const myIndex = primary
    ? board.findIndex((e) => e.address === primary)
    : -1;
  const boardRank = myIndex >= 0 ? myIndex + 1 : null;

  const shareUrl = cardId ? shareLink(cardId) : null;

  function postOnX() {
    if (!result || !shareUrl) return;
    const tier = tierForVolume(result.totalVolumeUsd);
    const text = `${tier.emoji} ${tier.label} — ${formatUsd(result.totalVolumeUsd)} lifetime perp volume on my PerpID.\n\nHow much have you really degen'd?`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`,
      "_blank",
    );
  }

  async function downloadPng() {
    if (!cardId || !result) return;
    const res = await fetch(`/api/card/${cardId}`);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `perpid-${tierForVolume(result.totalVolumeUsd).id}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const scannedNote =
    step === "scanning"
      ? `scanning ${V3_DEXES.length} DEXes…`
      : step === "signing"
        ? "1 signature → Paradex volume"
        : step === "error"
          ? (error ?? "scan failed")
          : `${wallets.length} wallet${wallets.length === 1 ? "" : "s"} · ${V3_DEXES.length} DEXes scanned`;

  const podium = board.slice(0, 3);
  const rows = board.slice(3, 12);

  return (
    <>
      <div className="v3-main">
        <div className="v3-hero">
          <h1>
            How much have you <span className="v3-hl">really</span>{" "}
            degen&apos;d?
          </h1>
          <p>
            One wallet signature. Four perp DEXes. Your entire perp history on
            one shareable card.
          </p>
        </div>

        <div className="v3-builder" id="build">
        {/* ---- Steps ---- */}
        <div className="v3-steps">
          <div className="v3-steps-label">BUILD YOUR CARD — ANY ORDER</div>

          {/* X step */}
          {xProfile ? (
            <div className="v3-step v3-step-done">
              <div className="v3-step-ico v3-step-ico-done">✓</div>
              <div className="v3-step-body">
                <div className="v3-step-title">𝕏 connected</div>
                <div className="v3-step-sub">@{xProfile.handle}</div>
              </div>
              <button className="v3-step-x" onClick={disconnectX}>
                unlink
              </button>
            </div>
          ) : askHandle && !oauthAvailable ? (
            <form
              className="v3-handle-form"
              onSubmit={(e) => {
                e.preventDefault();
                void connectXManual();
              }}
            >
              <input
                value={handleInput}
                onChange={(e) => setHandleInput(e.target.value)}
                placeholder="@yourhandle"
                autoFocus
              />
              <button type="submit">Link</button>
            </form>
          ) : (
            <button
              className="v3-step"
              onClick={() => {
                if (oauthAvailable) window.location.href = "/api/x/login";
                else void connectXViaSupabase();
              }}
            >
              <div className="v3-step-ico">𝕏</div>
              <div className="v3-step-body">
                <div className="v3-step-title">Connect 𝕏</div>
                <div className="v3-step-sub">for your pfp + handle</div>
              </div>
            </button>
          )}
          {xError && <div className="v3-error">{xError}</div>}

          {/* Wallet step */}
          {wallets.length > 0 || isConnected ? (
            <div className="v3-step v3-step-done v3-step-wallets">
              <div className="v3-step-ico v3-step-ico-done">✓</div>
              <div className="v3-step-body">
                <div className="v3-step-title">
                  {wallets.length > 0
                    ? `${wallets.length} wallet${wallets.length === 1 ? "" : "s"} connected`
                    : "Wallet connecting…"}
                </div>
                <div className="v3-step-sub">{scannedNote}</div>
                {wallets.length > 0 && (
                  <div className="v3-wallet-chips">
                    {wallets.map((w) => (
                      <span key={w} className="v3-wallet-chip">
                        {shortAddress(w)}
                        <button
                          type="button"
                          aria-label={`remove ${w}`}
                          onClick={() => removeWallet(w)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="v3-wallet-actions">
                  {addOpen ? (
                    <div className="v3-wallet-picker">
                      <div className="v3-wallet-picker-label">
                        connect another wallet
                      </div>
                      {connectors.map((c) => (
                        <button
                          key={c.uid}
                          type="button"
                          className="v3-wallet-pick"
                          disabled={isPending}
                          onClick={() => addViaConnector(c)}
                        >
                          <ConnectorIcon
                            icon={c.icon}
                            name={c.name}
                            id={c.id}
                            size={16}
                          />
                          {c.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="v3-wallet-pick"
                        onClick={() => void switchAccountInWallet()}
                      >
                        <span className="v3-wallet-pick-ico">⇄</span>
                        switch account in current wallet
                      </button>
                      <button
                        type="button"
                        className="v3-ext-cancel"
                        onClick={() => setAddOpen(false)}
                      >
                        cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="v3-wallet-add"
                        disabled={
                          isPending || step === "scanning" || step === "signing"
                        }
                        onClick={() => setAddOpen(true)}
                      >
                        + add another wallet
                      </button>
                      <span className="v3-wallet-hint">
                        connect a different wallet (or switch accounts) to stack
                        their volume
                      </span>
                    </>
                  )}
                </div>
                {linkError && <div className="v3-error">{linkError}</div>}
              </div>
              <button className="v3-step-x" onClick={disconnectAll}>
                disconnect
              </button>
            </div>
          ) : (
            <>
              {connectors.map((c) => (
                <button
                  key={c.uid}
                  className="v3-step"
                  disabled={isPending}
                  onClick={() => connect({ connector: c })}
                >
                  <div className="v3-step-ico">
                    <ConnectorIcon
                      icon={c.icon}
                      name={c.name}
                      id={c.id}
                      size={18}
                    />
                  </div>
                  <div className="v3-step-body">
                    <div className="v3-step-title">
                      {connectors.length > 1 ? c.name : "Connect wallet"}
                    </div>
                    <div className="v3-step-sub">
                      1 signature · Hyperliquid + Paradex
                    </div>
                  </div>
                </button>
              ))}
              {connectors.length === 0 && (
                <div className="v3-step-ghost">
                  <div className="v3-step-ico-ghost">
                    <WalletMark size={16} />
                  </div>
                  install MetaMask or Rabby
                </div>
              )}
            </>
          )}

          {/* dYdX API-key-free unlock via dydx1 address */}
          {wallets.length > 0 &&
            (dydxOpen ? (
              <form
                className="v3-ext-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void connectDydx();
                }}
              >
                <input
                  value={dydxInput}
                  onChange={(e) => setDydxInput(e.target.value)}
                  placeholder="dydx1… address"
                  autoFocus
                  disabled={dydxBusy}
                />
                <div className="v3-ext-row">
                  <button type="submit" disabled={dydxBusy || !dydxInput.trim()}>
                    {dydxBusy ? "checking…" : "Add"}
                  </button>
                  <button
                    type="button"
                    className="v3-ext-cancel"
                    onClick={() => {
                      setDydxOpen(false);
                      setDydxErr(null);
                    }}
                  >
                    cancel
                  </button>
                  <span className="v3-ext-hint">public · read-only</span>
                </div>
                {dydxErr && <div className="v3-error">{dydxErr}</div>}
              </form>
            ) : (
              <button
                type="button"
                className="v3-ext-toggle"
                onClick={() => setDydxOpen(true)}
              >
                + add dYdX volume (dydx1… address)
              </button>
            ))}

          {/* Card-ready step */}
          {step === "done" && result ? (
            <div className="v3-step v3-step-card-ready">
              <div className="v3-step-ico v3-step-ico-star">★</div>
              <div className="v3-step-body">
                <div className="v3-step-title">Card ready</div>
                <div className="v3-step-sub">
                  {boardRank
                    ? `rank #${boardRank} of ${board.length}`
                    : `${formatUsd(result.totalVolumeUsd)} counted`}
                </div>
              </div>
            </div>
          ) : (
            <div className="v3-step-ghost">
              <div className="v3-step-ico-ghost">★</div>
              Your card mints itself
            </div>
          )}

          <div className="v3-readonly-note">
            Read-only. No approvals, no spend permissions — we just read your
            fills.
          </div>
        </div>

        {/* ---- Live card ---- */}
        <div className="v3-card-col">
          <V3Card xProfile={xProfile} result={result} shareUrl={shareUrl} />
          {step === "done" && cardId ? (
            <div className="v3-actions">
              <button className="v3-pill v3-pill-dark" onClick={postOnX}>
                Share on 𝕏
              </button>
              <button className="v3-pill" onClick={downloadPng}>
                Download PNG
              </button>
              <button className="v3-pill" onClick={copyLink}>
                {copied ? "Copied ✓" : "Copy link"}
              </button>
            </div>
          ) : (
            <div className="v3-fill-hint">↑ your card fills in as you connect</div>
          )}
        </div>
        </div>
      </div>

      {/* ---- DEX strip ---- */}
      <div className="v3-strip">
        <div className="v3-strip-label">COUNTS VOLUME FROM</div>
        {V3_DEXES.map((d) => (
          <div className="v3-strip-chip" key={d.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.logo} alt="" />
            {d.name}
          </div>
        ))}
      </div>

      {/* ---- Leaderboard ---- */}
      <div id="leaderboard" className="v3-board">
        <div className="v3-board-head">
          <h2>The Degen Leaderboard</h2>
          <div className="v3-board-meta">
            {board.length} card{board.length === 1 ? "" : "s"} minted · ranked
            by total volume
          </div>
        </div>

        {board.length === 0 ? (
          <div className="v3-table">
            <div className="v3-board-empty">
              No cards minted yet — connect your wallet and take #1.
            </div>
          </div>
        ) : (
          <>
            <div className="v3-podium">
              {/* order: silver, gold, bronze visually; center = #1 */}
              {[1, 0, 2].map((idx) =>
                podium[idx] ? (
                  <PodiumCard
                    key={podium[idx].address}
                    entry={podium[idx]}
                    place={idx}
                  />
                ) : (
                  <div key={`empty-${idx}`} />
                ),
              )}
            </div>

            {(rows.length > 0 || (boardRank !== null && boardRank > 3)) && (
            <div className="v3-table">
              <div className="v3-thead">
                <div>RANK</div>
                <div>TRADER</div>
                <div style={{ textAlign: "right" }}>VOLUME</div>
                <div className="v3-th-trades" style={{ textAlign: "right" }}>
                  SCORE
                </div>
                <div className="v3-th-tier" style={{ textAlign: "right" }}>
                  TIER
                </div>
              </div>
              {rows.map((e, i) => (
                <BoardRow key={e.address} entry={e} rank={i + 4} you={false} />
              ))}
              {boardRank !== null && board[myIndex] && boardRank > 3 && (
                <BoardRow entry={board[myIndex]} rank={boardRank} you />
              )}
            </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function displayName(e: LeaderboardEntry): string {
  return e.x_handle ? `@${e.x_handle}` : shortAddress(e.address);
}

function initial(e: LeaderboardEntry): string {
  return (e.x_handle ?? e.address.slice(2, 3)).slice(0, 1).toUpperCase();
}

function PodiumCard({ entry, place }: { entry: LeaderboardEntry; place: number }) {
  const tier = tierForVolume(Number(entry.total_volume));
  return (
    <div className={`v3-podium-card${place === 0 ? " v3-podium-1" : ""}`}>
      <div className="v3-podium-medal">{MEDALS[place]}</div>
      <div className="v3-podium-avatar">
        {entry.x_avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.x_avatar} alt="" />
        ) : (
          initial(entry)
        )}
      </div>
      <div className="v3-podium-handle">{displayName(entry)}</div>
      <div className="v3-podium-vol">{formatUsd(Number(entry.total_volume))}</div>
      <div className="v3-podium-tier">
        {tier.emoji} {tier.label} · score {Math.round(Number(entry.score))}
      </div>
    </div>
  );
}

function BoardRow({
  entry,
  rank,
  you,
}: {
  entry: LeaderboardEntry;
  rank: number;
  you: boolean;
}) {
  const tier = tierForVolume(Number(entry.total_volume));
  return (
    <div className={`v3-trow${you ? " v3-trow-you" : ""}`}>
      <div className="v3-td-rank">{rank}</div>
      <div className="v3-td-trader">
        <div className="v3-td-avatar">
          {entry.x_avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.x_avatar} alt="" />
          ) : (
            initial(entry)
          )}
        </div>
        <span>{displayName(entry)}</span>
        {you && <span className="v3-you-chip">YOU</span>}
      </div>
      <div className="v3-td-num">{formatUsd(Number(entry.total_volume))}</div>
      <div className="v3-td-dim v3-td-trades">{Math.round(Number(entry.score))}</div>
      <div className="v3-td-tier">
        {tier.emoji} {tier.label}
      </div>
    </div>
  );
}
