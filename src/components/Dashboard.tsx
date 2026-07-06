"use client";

import { useState } from "react";
import type { DexVolume, VolumeResult } from "@/lib/types";
import { formatUsd } from "@/lib/ranks";
import { computeScore } from "@/lib/score";
import { evaluateAchievements } from "@/lib/achievements";
import { IdentityCard } from "./IdentityCard";
import { Icon } from "./Icons";

const DEX_INITIALS: Record<string, { label: string; bg: string; fg: string }> = {
  hyperliquid: { label: "HL", bg: "rgba(45,227,167,.13)", fg: "#2de3a7" },
  dydx: { label: "dY", bg: "rgba(143,123,255,.14)", fg: "#8f7bff" },
  lighter: { label: "Lt", bg: "rgba(56,207,255,.13)", fg: "#38cfff" },
  paradex: { label: "Pa", bg: "rgba(245,102,156,.13)", fg: "#f5669c" },
  edgex: { label: "eX", bg: "rgba(255,201,77,.13)", fg: "#ffc94d" },
  variational: { label: "Va", bg: "rgba(207,198,255,.12)", fg: "#cfc6ff" },
};

function StatusPill({ status }: { status: DexVolume["status"] }) {
  switch (status) {
    case "ok":
      return <span className="status-pill status-ok">Tracked</span>;
    case "auth_required":
      return <span className="status-pill status-auth">Auth needed</span>;
    case "no_account":
      return <span className="status-pill status-none">No account</span>;
    case "unsupported":
      return <span className="status-pill status-none">Coming soon</span>;
    default:
      return <span className="status-pill status-err">Error</span>;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** PopDex beta campaign — the first live access gate on PerpID. */
const CAMPAIGN: {
  project: string;
  perks: string;
  requirements: {
    label: string;
    check: (r: VolumeResult, now: number) => boolean;
  }[];
} = {
  project: "PopDex",
  perks: "Perp DEX closed beta",
  requirements: [
    {
      label: "Trader Score 70+",
      check: (r) => r.score.total >= 70,
    },
    {
      label: "Wallet age 180+ days",
      check: (r, now) => {
        const first = Math.min(
          ...r.breakdown.map((d) => d.stats?.firstActivityMs ?? Infinity),
        );
        return Number.isFinite(first) && now - first >= 180 * DAY_MS;
      },
    },
    {
      label: "$500K+ lifetime volume",
      check: (r) => r.totalVolumeUsd >= 500_000,
    },
    {
      label: "Verified wallet",
      check: (r) => r.verified,
    },
  ],
};

export function Dashboard({
  result,
  onRefresh,
}: {
  result: VolumeResult;
  onRefresh?: () => void;
}) {
  // Recompute for legacy cached/share payloads that predate the score field.
  const score =
    result.score ?? computeScore(result.breakdown, result.totalVolumeUsd);
  const achievements = evaluateAchievements(result, score);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  const active = result.breakdown.filter(
    (d) => d.status === "ok" && d.volumeUsd > 0,
  );
  const favorite = active.length
    ? active.reduce((a, b) => (b.volumeUsd > a.volumeUsd ? b : a))
    : null;
  const maxVol = Math.max(...active.map((d) => d.volumeUsd), 1);

  const firstTs = Math.min(
    ...result.breakdown.map((d) => d.stats?.firstActivityMs ?? Infinity),
  );
  const activeDays = result.breakdown.reduce(
    (sum, d) => sum + (d.stats?.activeDays ?? 0),
    0,
  );

  // Snapshotted once per mount so render stays pure for the compiler.
  const [now] = useState(() => Date.now());
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [requested, setRequested] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  async function ensureShare(): Promise<string> {
    if (shareUrl) return shareUrl;
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: result.address, verified: result.verified }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to create share link");
    const url = `${window.location.origin}${data.url}`;
    setShareUrl(url);
    return url;
  }

  async function handleCopyLink() {
    setShareError(null);
    try {
      const url = await ensureShare();
      await navigator.clipboard.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Share failed");
    }
  }

  async function handleTweet() {
    setShareError(null);
    try {
      const url = await ensureShare();
      const text = `Trader Score ${score.total} — ${score.rank.name.toUpperCase()} rank on PerpID.\n\n${formatUsd(result.totalVolumeUsd)} lifetime perp volume across ${active.length} protocol${active.length === 1 ? "" : "s"}.\n\nWhat's your Trader Score?`;
      window.open(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
        "_blank",
      );
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Share failed");
    }
  }

  async function handleDownload() {
    setShareError(null);
    setDownloading(true);
    try {
      const url = await ensureShare();
      const id = url.split("/").pop();
      const img = await fetch(`/api/card/${id}`);
      if (!img.ok) throw new Error("Card render failed");
      const blob = await img.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `perpid-${score.rank.id}-${score.total}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  const eligibility = CAMPAIGN.requirements.map((req) => ({
    ...req,
    pass: req.check(result, now),
  }));
  const eligible = eligibility.every((r) => r.pass);

  return (
    <div className="dashboard">
      <div className="dash-main">
        <div>
          <IdentityCard
            address={result.address}
            totalVolumeUsd={result.totalVolumeUsd}
            score={score}
            verified={result.verified}
            protocolsUsed={active.length}
            snapshotDate={result.fetchedAt}
          />

          <div className="card-actions">
            <button className="btn btn-ghost" onClick={handleCopyLink}>
              <Icon name="share" size={16} />
              {copied ? "Link copied ✓" : "Share"}
            </button>
            <button
              className="btn btn-ghost"
              onClick={handleDownload}
              disabled={downloading}
            >
              <Icon name="download" size={16} />
              {downloading ? "Rendering…" : "Download"}
            </button>
            <button className="btn btn-primary" onClick={handleTweet}>
              <Icon name="x" size={15} />
              Post
            </button>
          </div>
          {shareError && <p className="error-text">{shareError}</p>}
          {result.cached && onRefresh && (
            <p className="hint-text">
              Snapshot served from cache.{" "}
              <button className="link-btn" onClick={onRefresh}>
                Refresh now
              </button>
            </p>
          )}
        </div>

        <div className="dash-side">
          {/* Stats grid */}
          <section className="panel glass fade-up">
            <h2 className="panel-title label">Statistics</h2>
            <div className="stats-grid">
              <div className="stat">
                <span className="stat-value mono">
                  {formatUsd(result.totalVolumeUsd)}
                </span>
                <span className="stat-label">Lifetime volume</span>
              </div>
              <div className="stat">
                <span className="stat-value mono">{active.length}</span>
                <span className="stat-label">Protocols used</span>
              </div>
              <div className="stat">
                <span className="stat-value mono">
                  {Number.isFinite(firstTs)
                    ? `${Math.max(Math.round((now - firstTs) / DAY_MS), 1)}d`
                    : "—"}
                </span>
                <span className="stat-label">Wallet age</span>
              </div>
              <div className="stat">
                <span className="stat-value mono">
                  {activeDays > 0 ? activeDays : "—"}
                </span>
                <span className="stat-label">Trading days</span>
              </div>
              <div className="stat">
                <span className="stat-value mono">
                  {Number.isFinite(firstTs)
                    ? new Date(firstTs).toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </span>
                <span className="stat-label">First trade</span>
              </div>
              <div className="stat">
                <span className="stat-value">{favorite?.name ?? "—"}</span>
                <span className="stat-label">Favorite protocol</span>
              </div>
            </div>
          </section>

          {/* Score breakdown */}
          <section className="panel glass fade-up" style={{ animationDelay: "80ms" }}>
            <h2 className="panel-title label">Score Breakdown</h2>
            <div className="metrics">
              {score.metrics.map((m, i) => (
                <div className="metric-row" key={m.id}>
                  <span className="metric-name">
                    {m.label}
                    <span className="metric-weight mono">
                      {Math.round(m.weight * 100)}%
                    </span>
                  </span>
                  <div className="metric-track">
                    <div
                      className="metric-fill"
                      style={{
                        width: `${Math.max(m.score * 100, 2)}%`,
                        animationDelay: `${0.15 + i * 0.08}s`,
                      }}
                    />
                  </div>
                  <span className="metric-value mono">
                    {m.display}
                    {m.estimated && <em title="Estimated from partial data">*</em>}
                  </span>
                </div>
              ))}
            </div>
            <p className="metric-footnote">
              * estimated — connect more protocols to sharpen your score.
            </p>
          </section>
        </div>
      </div>

      {/* Protocol breakdown */}
      <section className="panel glass fade-up" style={{ animationDelay: "120ms" }}>
        <h2 className="panel-title label">Protocol Breakdown</h2>
        <div className="dex-grid">
          {result.breakdown.map((d, i) => (
            <div
              key={d.dex}
              className="dex-row fade-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="dex-row-left">
                <div
                  className="dex-logo display"
                  style={{
                    background: DEX_INITIALS[d.dex]?.bg,
                    color: DEX_INITIALS[d.dex]?.fg,
                  }}
                >
                  {DEX_INITIALS[d.dex]?.label ?? d.name[0]}
                </div>
                <div>
                  <div className="dex-name">{d.name}</div>
                  {d.note && <div className="dex-note">{d.note}</div>}
                </div>
              </div>
              <div className="dex-row-right">
                {d.status === "ok" ? (
                  <>
                    <div className="dex-bar-track">
                      <div
                        className="dex-bar-fill"
                        style={{
                          width: `${Math.max((d.volumeUsd / maxVol) * 100, 2)}%`,
                          background: DEX_INITIALS[d.dex]?.fg,
                        }}
                      />
                    </div>
                    <span className="dex-volume mono">{formatUsd(d.volumeUsd)}</span>
                  </>
                ) : (
                  <StatusPill status={d.status} />
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Achievements */}
      <section className="panel glass fade-up" style={{ animationDelay: "160ms" }}>
        <h2 className="panel-title label">
          Achievements
          <span className="panel-count mono">
            {unlockedCount}/{achievements.length}
          </span>
        </h2>
        <div className="ach-grid">
          {achievements.map((a, i) => (
            <div
              key={a.id}
              className={`ach ${a.unlocked ? "ach-unlocked" : "ach-locked"} pop-in`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="ach-icon">
                <Icon name={a.unlocked ? a.icon : "lock"} size={20} />
              </div>
              <div className="ach-name">{a.name}</div>
              <div className="ach-req">{a.requirement}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Beta access */}
      <section className="panel glass beta-panel fade-up" style={{ animationDelay: "200ms" }}>
        <div className="beta-head">
          <div>
            <h2 className="panel-title label">Access Campaigns</h2>
            <div className="beta-project display">
              {CAMPAIGN.project}
              <span className="beta-perks">{CAMPAIGN.perks}</span>
            </div>
          </div>
          <button
            className={eligible ? "btn btn-gold" : "btn btn-ghost"}
            disabled={!eligible || requested}
            onClick={() => setRequested(true)}
          >
            {requested
              ? "Request submitted ✓"
              : eligible
                ? "Request Access"
                : "Not eligible yet"}
          </button>
        </div>
        <ul className="beta-reqs">
          {eligibility.map((req) => (
            <li key={req.label} className={req.pass ? "req-pass" : "req-fail"}>
              <Icon name={req.pass ? "check" : "cross"} size={14} />
              {req.label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
