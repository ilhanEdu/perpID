import { readFile } from "fs/promises";
import { join } from "path";
import type { ShareRecord } from "./types";
import { V3_DEXES } from "./dexRoster";
import { tierForVolume } from "./tiers";
import { formatUsd, shortAddress } from "./ranks";
import { APP_HOST, shareLink } from "./appUrl";
import { qrDataUrl } from "./qr";
import {
  CARD_CREAM as CREAM,
  CARD_INK as INK,
  CARD_LIME as LIME,
  CARD_MUTED as MUTED,
  CARD_MUTED2 as MUTED2,
  CARD_TEXTURE,
  cardTheme,
  foilGradient,
} from "./cardTheme";

/**
 * The downloadable/OG PNG of the PerpID card — a 2× render of the live
 * 660×371 card. Holographic-foil collectible look: tier-driven accent, glow,
 * foil badges, orbit-glow + connector lines, on a subtle foil texture.
 * Must stay pixel-identical to the live card (V3Card.tsx).
 *
 * Satori rules: every element has an explicit display and every text node
 * is a single pre-built string. No filter/blur/pseudo-elements — glow via
 * box-shadow, texture via a data-URI PNG, gradient text via backgroundClip.
 */

export const CARD_SIZE = { width: 1320, height: 742 };

const S = 2; // scale from design units (660×371)

async function asset(relPath: string): Promise<string | null> {
  try {
    const file = await readFile(join(process.cwd(), "public", relPath));
    const ext = relPath.endsWith(".png") ? "png" : "jpeg";
    return `data:image/${ext};base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

async function fetchAvatar(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function renderShareCard(share: ShareRecord | null) {
  const total = Number(share?.total_volume ?? 0);
  const breakdown = share?.breakdown_json ?? [];
  const tier = tierForVolume(total);
  const theme = cardTheme(tier);

  const [avatar, qr, texture, ...logos] = await Promise.all([
    fetchAvatar(share?.x_avatar),
    share ? qrDataUrl(shareLink(share.id)) : Promise.resolve<string | null>(null),
    asset(CARD_TEXTURE),
    ...V3_DEXES.map((d) => asset(d.logo.replace(/^\//, ""))),
  ]);

  // Orbit geometry (design units, then scaled).
  const CX = 175;
  const CY = 182;
  const maxVol = Math.max(
    0,
    ...breakdown.filter((d) => d.status === "ok").map((d) => d.volumeUsd),
  );
  const bubbles = V3_DEXES.map((dex, i) => {
    const row = breakdown.find((d) => d.dex === dex.id);
    const vol = row?.status === "ok" ? row.volumeUsd : 0;
    const share_ = total > 0 ? vol / total : 0;
    const size = Math.round(26 + Math.sqrt(share_) * 60);
    const r = 118 + size * 0.18;
    const rad = (dex.angle * Math.PI) / 180;
    const px = Math.round(CX + r * Math.cos(rad) - size / 2) * S;
    const py = Math.round(CY + r * Math.sin(rad) - size / 2) * S;
    return {
      ...dex,
      logoData: logos[i],
      live: vol > 0,
      isTop: vol > 0 && vol === maxVol,
      vol,
      size: size * S,
      x: px,
      y: py,
      cx: px + (size * S) / 2,
      cy: py + (size * S) / 2,
    };
  });

  // Constellation lines from avatar centre to each live bubble (rotate about
  // the segment midpoint so no transform-origin is needed).
  const AVX = CX * S;
  const AVY = CY * S;
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

  const active = breakdown.filter((d) => d.status === "ok" && d.volumeUsd > 0);
  const firstTs = Math.min(
    ...breakdown.map((d) => d.stats?.firstActivityMs ?? Infinity),
  );
  const firstTrade = Number.isFinite(firstTs)
    ? new Date(firstTs)
        .toLocaleDateString("en-US", { month: "short", year: "2-digit" })
        .replace(" ", " '")
    : "—";
  const activeDays = breakdown.reduce(
    (sum, d) => sum + (d.stats?.activeDays ?? 0),
    0,
  );
  const topVenue = active.length
    ? active.reduce((a, b) => (b.volumeUsd > a.volumeUsd ? b : a)).name
    : "—";

  const name = share?.x_name ?? null;
  const handle = share?.x_handle ? `@${share.x_handle}` : null;
  const urlText = APP_HOST;
  const initials = (share?.x_handle ?? share?.address.slice(2, 4) ?? "??")
    .slice(0, 2)
    .toUpperCase();

  const stat = (value: string, label: string) => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span
        style={{
          display: "flex",
          fontSize: 17 * S,
          fontWeight: 700,
          color: CREAM,
        }}
      >
        {value}
      </span>
      <span
        style={{
          display: "flex",
          fontSize: 10.5 * S,
          letterSpacing: 1,
          color: MUTED2,
        }}
      >
        {label}
      </span>
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        backgroundColor: INK,
        backgroundImage: [
          "radial-gradient(circle at 16% 10%, rgba(250,246,236,0.07), rgba(22,19,12,0) 42%)",
          `radial-gradient(circle at 350px 364px, ${theme.accentSoft}, rgba(22,19,12,0) 46%)`,
          "radial-gradient(circle at 62% 128%, rgba(0,0,0,0.55), rgba(22,19,12,0) 52%)",
        ].join(", "),
        color: CREAM,
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      {/* foil texture overlay */}
      {texture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={texture}
          alt=""
          width={CARD_SIZE.width}
          height={CARD_SIZE.height}
          style={{ position: "absolute", left: 0, top: 0, opacity: 0.5 }}
        />
      ) : null}

      {/* inner foil edge */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 6,
          top: 6,
          right: 6,
          bottom: 6,
          borderRadius: 26,
          border: `2px solid ${theme.accentSoft}`,
        }}
      />

      {/* corner verified seal */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 20 * S,
          top: 16 * S,
          alignItems: "center",
          gap: 4 * S,
          backgroundImage: foilGradient(theme, 120),
          color: INK,
          fontSize: 8 * S,
          fontWeight: 800,
          letterSpacing: 1,
          padding: `${3 * S}px ${7 * S}px`,
          borderRadius: 999,
          transform: "rotate(-3deg)",
          boxShadow: `0 0 ${10 * S}px ${theme.glow}`,
        }}
      >
        <div
          style={{
            display: "flex",
            width: 6 * S,
            height: 6 * S,
            backgroundColor: INK,
            transform: "rotate(45deg)",
          }}
        />
        <span style={{ display: "flex" }}>VERIFIED</span>
      </div>

      {/* orbit rings */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 85 * S,
          top: 92 * S,
          width: 180 * S,
          height: 180 * S,
          borderRadius: 999,
          border: `2px solid ${theme.accentSoft}`,
          boxShadow: `0 0 ${16 * S}px ${theme.accentSoft}`,
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 43 * S,
          top: 50 * S,
          width: 264 * S,
          height: 264 * S,
          borderRadius: 999,
          border: "1.5px solid rgba(250,246,236,0.08)",
        }}
      />

      {/* constellation connector lines (under bubbles) */}
      {connectors.map((c) => (
        <div
          key={c.key}
          style={{
            display: "flex",
            position: "absolute",
            left: c.left,
            top: c.top,
            width: c.len,
            height: 2,
            backgroundImage: `linear-gradient(90deg, ${theme.glow}, rgba(22,19,12,0))`,
            transform: `rotate(${c.angle}deg)`,
            opacity: 0.55,
          }}
        />
      ))}

      {/* sparkles (diamonds — glyphs like ✦ aren't in Satori's font) */}
      <div style={{ display: "flex", position: "absolute", left: 318 * S, top: 24 * S, width: 9 * S, height: 9 * S, backgroundColor: theme.accent, transform: "rotate(45deg)", boxShadow: `0 0 ${8 * S}px ${theme.glow}` }} />
      <div style={{ display: "flex", position: "absolute", left: 24 * S, top: 302 * S, width: 6 * S, height: 6 * S, backgroundColor: "rgba(250,246,236,0.5)", transform: "rotate(45deg)" }} />
      <div style={{ display: "flex", position: "absolute", left: 300 * S, top: 322 * S, width: 5 * S, height: 5 * S, backgroundColor: theme.accent, transform: "rotate(45deg)" }} />

      {/* avatar core */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 127 * S,
          top: 134 * S,
          width: 96 * S,
          height: 96 * S,
          borderRadius: 999,
          backgroundImage: `radial-gradient(circle at 38% 30%, #EAFFA0, ${LIME} 58%, #A6D83C)`,
          color: INK,
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 34 * S,
          border: `6px solid ${CREAM}`,
          boxShadow: `0 0 0 ${5 * S}px ${theme.accentSoft}, 0 0 ${34 * S}px ${theme.glow}`,
          overflow: "hidden",
        }}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt=""
            width={96 * S}
            height={96 * S}
            style={{ objectFit: "cover", borderRadius: 999 }}
          />
        ) : (
          initials
        )}
      </div>

      {/* dex orbit bubbles */}
      {bubbles.map((b) => (
        <div
          key={b.id}
          style={{
            display: "flex",
            position: "absolute",
            left: b.x,
            top: b.y,
            width: b.size,
            height: b.size,
            borderRadius: 999,
            overflow: "hidden",
            border: b.isTop
              ? `${4 * S}px solid ${theme.accent}`
              : b.live
                ? "4px solid rgba(250,246,236,0.92)"
                : "3px solid rgba(74,70,54,0.9)",
            backgroundColor: "#221E15",
            opacity: b.live ? 1 : 0.34,
            boxShadow: b.isTop
              ? `0 0 ${16 * S}px ${theme.glow}`
              : b.live
                ? `0 0 ${8 * S}px ${theme.accentSoft}`
                : "none",
          }}
        >
          {b.logoData ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={b.logoData}
              alt=""
              width={b.size}
              height={b.size}
              style={{ objectFit: "cover", borderRadius: 999 }}
            />
          ) : (
            <div style={{ display: "flex", width: b.size, height: b.size }} />
          )}
        </div>
      ))}

      {/* gem marker on the top-venue bubble */}
      {bubbles
        .filter((b) => b.isTop)
        .map((b) => (
          <div
            key={`crown-${b.id}`}
            style={{
              display: "flex",
              position: "absolute",
              left: b.cx - 6 * S,
              top: b.y - 14 * S,
              width: 12 * S,
              height: 12 * S,
              backgroundColor: theme.accent,
              transform: "rotate(45deg)",
              boxShadow: `0 0 ${9 * S}px ${theme.glow}`,
            }}
          />
        ))}

      {/* right panel */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 352 * S,
          right: 24 * S,
          top: 24 * S,
          bottom: 20 * S,
          flexDirection: "column",
          gap: 12 * S,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 8 * S,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span
              style={{
                display: "flex",
                fontWeight: 800,
                fontSize: 22 * S,
                color: CREAM,
              }}
            >
              {name ?? (share ? shortAddress(share.address) : "anon")}
            </span>
            {handle ? (
              <span style={{ display: "flex", fontSize: 13 * S, color: MUTED2 }}>
                {handle}
              </span>
            ) : null}
          </div>
          <div
            style={{
              display: "flex",
              backgroundImage: foilGradient(theme, 110),
              color: INK,
              border: `${3 * S}px solid ${CREAM}`,
              borderRadius: 10 * S,
              padding: `${5 * S}px ${11 * S}px`,
              fontWeight: 800,
              fontSize: 14 * S,
              transform: "rotate(3deg)",
              boxShadow: `0 0 ${14 * S}px ${theme.glow}`,
            }}
          >
            {`${tier.emoji} ${tier.label}`}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 2 * S }}>
          <span
            style={{
              display: "flex",
              fontSize: 11 * S,
              letterSpacing: 2,
              color: MUTED2,
            }}
          >
            LIFETIME PERP VOLUME
          </span>
          <span
            style={{
              display: "flex",
              fontWeight: 800,
              fontSize: 46 * S,
              lineHeight: 1,
              letterSpacing: -1,
              backgroundImage: `linear-gradient(92deg, ${LIME}, ${theme.accent})`,
              backgroundClip: "text",
              color: "transparent",
              textShadow: `0 0 ${22 * S}px ${theme.glow}`,
            }}
          >
            {formatUsd(total)}
          </span>
          <div
            style={{
              display: "flex",
              width: 60 * S,
              height: 3 * S,
              marginTop: 3 * S,
              borderRadius: 999,
              backgroundImage: `linear-gradient(90deg, ${LIME}, ${theme.accent})`,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            width: "100%",
            height: 1,
            backgroundColor: "rgba(250,246,236,0.10)",
          }}
        />

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: `${8 * S}px ${14 * S}px`,
          }}
        >
          <div style={{ display: "flex", width: "45%" }}>
            {stat(`${active.length}`, "DEXES")}
          </div>
          <div style={{ display: "flex", width: "45%" }}>
            {stat(firstTrade, "FIRST TRADE")}
          </div>
          <div style={{ display: "flex", width: "45%" }}>
            {stat(activeDays > 0 ? `${activeDays}` : "—", "ACTIVE DAYS")}
          </div>
          <div style={{ display: "flex", width: "45%" }}>
            {stat(topVenue, "TOP VENUE")}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "auto",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 3 * S }}>
            <span
              style={{
                display: "flex",
                fontWeight: 800,
                fontSize: 13 * S,
                color: INK,
                backgroundImage: foilGradient(theme, 100),
                padding: `${3 * S}px ${9 * S}px`,
                borderRadius: 6 * S,
                transform: "rotate(-2deg)",
                boxShadow: `0 0 ${10 * S}px ${theme.glow}`,
              }}
            >
              PerpID
            </span>
            <span style={{ display: "flex", fontSize: 10 * S, color: MUTED2 }}>
              {urlText}
            </span>
            <span style={{ display: "flex", fontSize: 9 * S, color: MUTED }}>
              read-only · your keys stay yours
            </span>
          </div>
          <div
            style={{
              display: "flex",
              width: 44 * S,
              height: 44 * S,
              borderRadius: 8 * S,
              backgroundColor: CREAM,
              padding: 3 * S,
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 0 ${1.5 * S}px ${theme.accent}`,
            }}
          >
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt=""
                width={38 * S}
                height={38 * S}
                style={{ display: "flex" }}
              />
            ) : (
              <div style={{ display: "flex" }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
