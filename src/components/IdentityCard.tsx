"use client";

import { useEffect, useRef, useState } from "react";
import type { TraderScore } from "@/lib/types";
import { formatUsd, rankImage, shortAddress } from "@/lib/ranks";
import { ScoreRing } from "./ScoreRing";
import { LogoMark } from "./Logo";

const CONFETTI_COLORS = ["#8F7BFF", "#38CFFF", "#FFC94D", "#EEF1FF", "#FF5D73"];

interface ConfettiPiece {
  cx: string;
  cy: string;
  cr: string;
  cd: string;
  c: string;
}

/** One-shot celebration burst for Astral+ cards. Client-only (random). */
function Confetti() {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const frame = requestAnimationFrame(() => {
      setPieces(
        Array.from({ length: 26 }, (_, i) => {
          const angle = Math.PI * (i / 26) * 2 + Math.random() * 0.4;
          const dist = 90 + Math.random() * 130;
          return {
            cx: `${Math.cos(angle) * dist}px`,
            cy: `${Math.sin(angle) * dist - 70}px`,
            cr: `${Math.round(Math.random() * 540 - 270)}deg`,
            cd: `${(Math.random() * 0.18).toFixed(2)}s`,
            c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          };
        }),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  if (pieces.length === 0) return null;
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={
            {
              "--cx": p.cx,
              "--cy": p.cy,
              "--cr": p.cr,
              "--cd": p.cd,
              "--c": p.c,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * The PerpID identity card — a collectible hero card built around the rank
 * artwork, Trader Score ring and lifetime volume. 3D tilt + cursor shine
 * are pointer-only, so touch devices and SSR are unaffected.
 */
export function IdentityCard({
  address,
  totalVolumeUsd,
  score,
  verified,
  protocolsUsed,
  snapshotDate,
}: {
  address: string;
  totalVolumeUsd: number;
  score: TraderScore;
  verified: boolean;
  protocolsUsed: number;
  snapshotDate?: string;
}) {
  const { rank } = score;
  const cardRef = useRef<HTMLDivElement>(null);

  function handleMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = cardRef.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${(px - 0.5) * 10}deg`);
    el.style.setProperty("--rx", `${(0.5 - py) * 8}deg`);
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
  }
  function handleLeave() {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  return (
    <div className="idcard-wrap pop-in">
      <div
        ref={cardRef}
        className="idcard"
        style={{ "--rank-glow": rank.glow } as React.CSSProperties}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
      >
        <div className="idcard-inner">
          {score.total >= 70 && <Confetti />}

          {/* Rank artwork backdrop */}
          <div
            className="idcard-art"
            style={{ backgroundImage: `url(${rankImage(rank)})` }}
            aria-hidden
          />
          <div className="idcard-veil" aria-hidden />

          <div className="idcard-content">
            <div className="idcard-head">
              <span className="idcard-brand display">
                <LogoMark size={20} />
                Perp<span className="gradient-text">ID</span>
              </span>
              <span className={verified ? "verified-badge" : "unverified-badge"}>
                {verified ? "✓ Verified" : "Unverified"}
              </span>
            </div>

            <div className="idcard-rank">
              <span className="idcard-rank-label label">Rank</span>
              <span
                className="idcard-rank-name display"
                style={{ color: rank.color, textShadow: `0 0 26px ${rank.glow}` }}
              >
                {rank.name}
              </span>
              <span className="idcard-rank-title">{rank.title}</span>
            </div>

            <div className="idcard-score">
              <ScoreRing score={score.total} rank={rank} size={168} />
            </div>

            <div className="idcard-stats">
              <div>
                <span className="idcard-stat-value mono">
                  {formatUsd(totalVolumeUsd)}
                </span>
                <span className="idcard-stat-label">Lifetime volume</span>
              </div>
              <div>
                <span className="idcard-stat-value mono">{protocolsUsed}</span>
                <span className="idcard-stat-label">Protocols</span>
              </div>
              <div>
                <span className="idcard-stat-value mono">
                  {score.next ? `+${score.toNext}` : "MAX"}
                </span>
                <span className="idcard-stat-label">
                  {score.next ? `To ${score.next.name}` : "Top rank"}
                </span>
              </div>
            </div>

            {score.next && (
              <div className="idcard-next">
                <div className="idcard-next-track">
                  <div
                    className="idcard-next-fill"
                    style={{
                      width: `${Math.max(
                        ((score.total - rank.minScore) /
                          (score.next.minScore - rank.minScore)) *
                          100,
                        3,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="idcard-foot">
              <span className="mono">{shortAddress(address)}</span>
              <span>
                perpid.xyz
                {snapshotDate &&
                  ` · ${new Date(snapshotDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
