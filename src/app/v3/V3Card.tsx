"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { VolumeResult, XProfile } from "@/lib/types";
import { V3_DEXES } from "@/lib/dexRoster";
import { formatUsd } from "@/lib/ranks";
import { tierForVolume } from "@/lib/tiers";
import { APP_HOST } from "@/lib/appUrl";
import { qrDataUrl } from "@/lib/qr";
import {
  CARD_LIME,
  NEUTRAL_THEME,
  cardTheme,
  foilGradient,
} from "@/lib/cardTheme";

const AVX = 175;
const AVY = 182;

/** Bubble geometry from the design: size ∝ sqrt(volume share). */
export function orbitLayout(result: VolumeResult | null) {
  const total = result?.totalVolumeUsd ?? 0;
  const maxVol = result
    ? Math.max(
        0,
        ...result.breakdown.filter((d) => d.status === "ok").map((d) => d.volumeUsd),
      )
    : 0;
  return V3_DEXES.map((dex) => {
    const row = result?.breakdown.find((d) => d.dex === dex.id);
    const vol = row?.status === "ok" ? row.volumeUsd : 0;
    const share = total > 0 ? vol / total : 0;
    const live = Boolean(result) && vol > 0;
    const size = result ? Math.round(26 + Math.sqrt(share) * 60) : 40;
    const r = result ? 118 + size * 0.18 : 112;
    const rad = (dex.angle * Math.PI) / 180;
    const x = Math.round(AVX + r * Math.cos(rad) - size / 2);
    const y = Math.round(AVY + r * Math.sin(rad) - size / 2);
    return {
      ...dex,
      vol,
      live,
      isTop: live && vol > 0 && vol === maxVol,
      size,
      x,
      y,
      cx: x + size / 2,
      cy: y + size / 2,
      showVol: live && size >= 50,
    };
  });
}

/**
 * The live PerpID card (660×371 design units, scaled to fit its container).
 * Fills in as the user connects X and their wallet.
 */
export function V3Card({
  xProfile,
  result,
  shareUrl,
}: {
  xProfile: XProfile | null;
  result: VolumeResult | null;
  shareUrl: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      setScale(Math.min(1, w / 660));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Real QR of the share link — same one baked into the downloadable PNG.
  useEffect(() => {
    let alive = true;
    const gen = shareUrl
      ? qrDataUrl(shareUrl)
      : Promise.resolve<string | null>(null);
    gen.then((d) => alive && setQr(d)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [shareUrl]);

  const bubbles = orbitLayout(result);
  const tier = result ? tierForVolume(result.totalVolumeUsd) : null;
  const active = result
    ? result.breakdown.filter((d) => d.status === "ok" && d.volumeUsd > 0)
    : [];
  const firstTs = result
    ? Math.min(
        ...result.breakdown.map((d) => d.stats?.firstActivityMs ?? Infinity),
      )
    : Infinity;
  const activeDays = result
    ? result.breakdown.reduce((sum, d) => sum + (d.stats?.activeDays ?? 0), 0)
    : 0;
  const firstTrade = Number.isFinite(firstTs)
    ? new Date(firstTs)
        .toLocaleDateString("en-US", { month: "short", year: "2-digit" })
        .replace(" ", " '")
    : "—";
  const topVenue = active.length
    ? active.reduce((a, b) => (b.volumeUsd > a.volumeUsd ? b : a)).name
    : "—";

  const theme = tier ? cardTheme(tier) : NEUTRAL_THEME;
  const cardVars = {
    transform: `scale(${scale})`,
    "--accent": theme.accent,
    "--accent-soft": theme.accentSoft,
    "--accent-glow": theme.glow,
    "--foil": foilGradient(theme, 110),
    "--foil-chip": foilGradient(theme, 100),
    "--vol-grad": `linear-gradient(92deg, ${CARD_LIME}, ${theme.accent})`,
  } as CSSProperties;

  const connectors = bubbles
    .filter((b) => b.live)
    .map((b) => {
      const dx = b.cx - AVX;
      const dy = b.cy - AVY;
      const len = Math.hypot(dx, dy);
      return {
        key: b.id,
        len,
        left: (AVX + b.cx) / 2 - len / 2,
        top: (AVY + b.cy) / 2 - 1,
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
      };
    });

  return (
    <div ref={wrapRef} className="v3-card-wrap" style={{ height: Math.round(371 * scale) }}>
      <div className="v3-card" style={cardVars}>
        {/* foil texture + edge */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="v3-card-texture" src="/card-foil.png" alt="" />
        <div className="v3-foil-edge" />

        {/* orbit rings */}
        <div className="v3-ring" style={{ left: 85, top: 92, width: 180, height: 180 }} />
        <div className="v3-ring v3-ring-outer" style={{ left: 43, top: 50, width: 264, height: 264 }} />

        {/* constellation connectors (under bubbles) */}
        {connectors.map((c) => (
          <div
            key={c.key}
            className="v3-connector"
            style={{ left: c.left, top: c.top, width: c.len, transform: `rotate(${c.angle}deg)` }}
          />
        ))}

        {/* sparkles */}
        <div className="v3-sparkle" style={{ left: 318, top: 24, width: 9, height: 9, background: "var(--accent)" }} />
        <div className="v3-sparkle" style={{ left: 24, top: 302, width: 6, height: 6, background: "rgba(250,246,236,0.5)" }} />
        <div className="v3-sparkle" style={{ left: 300, top: 322, width: 5, height: 5, background: "var(--accent)" }} />

        {/* verified seal */}
        {result ? (
          <div className="v3-verified">
            <span className="v3-verified-dot" />
            VERIFIED
          </div>
        ) : null}

        {/* avatar core */}
        {xProfile ? (
          <div className="v3-avatar">
            {xProfile.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={xProfile.avatar} alt={`@${xProfile.handle}`} />
            ) : (
              xProfile.handle.slice(0, 2).toUpperCase()
            )}
          </div>
        ) : (
          <div className="v3-avatar-ghost">your pfp</div>
        )}

        {/* dex orbit — logo bubbles sized by volume share */}
        {bubbles.map((b) => (
          <div
            key={b.id}
            className={`v3-bubble${b.live ? "" : " v3-bubble-dim"}${b.isTop ? " v3-bubble-top" : ""}`}
            title={`${b.name}${b.live ? ` · ${formatUsd(b.vol)}` : ""}`}
            style={{ left: b.x, top: b.y, width: b.size, height: b.size }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.logo} alt={b.name} />
            {b.showVol && <span className="v3-bubble-vol">{formatUsd(b.vol)}</span>}
          </div>
        ))}

        {/* gem on the top-venue bubble */}
        {bubbles
          .filter((b) => b.isTop)
          .map((b) => (
            <div
              key={`gem-${b.id}`}
              className="v3-gem"
              style={{ left: b.cx - 6, top: b.y - 14 }}
            />
          ))}

        {/* right panel */}
        <div className="v3-panel">
          <div className="v3-panel-top">
            {xProfile ? (
              <div>
                <div className="v3-panel-name">{xProfile.name}</div>
                <div className="v3-panel-handle">@{xProfile.handle}</div>
              </div>
            ) : (
              <div className="v3-panel-nox">
                ← connect 𝕏<br />for your handle
              </div>
            )}
            {tier ? (
              <div className="v3-tier">
                {tier.emoji} {tier.label}
              </div>
            ) : (
              <div className="v3-tier-ghost">tier: ??</div>
            )}
          </div>

          {result ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div className="v3-vol-label">LIFETIME PERP VOLUME</div>
                <div className="v3-vol">{formatUsd(result.totalVolumeUsd)}</div>
                <div className="v3-vol-underline" />
              </div>
              <div className="v3-panel-divider" />
              <div className="v3-panel-grid">
                <div>
                  <span>{active.length}</span>
                  <span>DEXes</span>
                </div>
                <div>
                  <span>{firstTrade}</span>
                  <span>first trade</span>
                </div>
                <div>
                  <span>{activeDays > 0 ? activeDays : "—"}</span>
                  <span>active days</span>
                </div>
                <div>
                  <span>{topVenue}</span>
                  <span>top venue</span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="v3-vol-label" style={{ color: "var(--muted)" }}>
                LIFETIME PERP VOLUME
              </div>
              <div className="v3-vol-placeholder" />
              <div className="v3-wait">waiting for wallet…</div>
            </div>
          )}

          <div className="v3-panel-foot">
            <div className="v3-panel-brand">
              <div className="v3-panel-brand-chip">PerpID</div>
              <div className="v3-panel-url">{APP_HOST}</div>
              <div className="v3-panel-readonly">
                read-only · your keys stay yours
              </div>
            </div>
            <div className="v3-qr">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="" />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
