"use client";

import { useEffect, useState } from "react";
import type { Rank } from "@/lib/types";

/** Eases a number from 0 to its target after mount. */
export function useCountUp(target: number, durationMs = 1400): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const skipAnimation =
      target <= 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      if (skipAnimation) {
        setValue(target);
        return;
      }
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(2, -10 * t); // easeOutExpo
      setValue(t >= 1 ? target : target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);
  return value;
}

/**
 * The Trader Score radial — a glowing gradient arc with the score counted
 * up in the center. Sized by the parent via the `size` prop.
 */
export function ScoreRing({
  score,
  rank,
  size = 170,
}: {
  score: number;
  rank: Rank;
  size?: number;
}) {
  const displayed = useCountUp(score);
  const stroke = size * 0.062;
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const filled = c * (displayed / 100);

  return (
    <div
      className="score-ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Trader Score ${score} out of 100 — rank ${rank.name}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#38cfff" />
            <stop offset="55%" stopColor="#8f7bff" />
            <stop offset="100%" stopColor={rank.color} />
          </linearGradient>
          <filter id="ring-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={stroke * 0.55} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(164,176,255,0.12)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ring-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          filter="url(#ring-glow)"
        />
      </svg>
      <div className="score-ring-center">
        <span className="score-ring-value display glow-text">
          {Math.round(displayed)}
        </span>
        <span className="score-ring-label">Trader Score</span>
      </div>
    </div>
  );
}
