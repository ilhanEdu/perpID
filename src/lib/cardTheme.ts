import type { Tier } from "./tiers";

/**
 * Shared visual theme for the PerpID card so the live card (V3Card.tsx) and
 * the Satori/OG render (og-card.tsx) stay identical. The brand base is always
 * ink + cream + lime; the *tier* drives an accent used for glows, the foil
 * tier badge, the volume gradient, the avatar halo and the top-venue bubble —
 * so higher tiers read as rarer without leaving the brand.
 */

export const CARD_INK = "#16130C";
export const CARD_CREAM = "#FAF6EC";
export const CARD_LIME = "#C6F24E";
export const CARD_MUTED = "#6E6858";
export const CARD_MUTED2 = "#B5AE9C";

/** Full-cover holo-foil texture (public/card-foil.png), rendered at low opacity. */
export const CARD_TEXTURE = "card-foil.png";

export interface CardTheme {
  accent: string; // solid tier accent
  accentSoft: string; // low-alpha fill/radial tint
  glow: string; // mid-alpha glow
  foil: [string, string, string]; // holographic pill gradient stops
}

const THEMES: Record<Tier["id"], CardTheme> = {
  shrimp: {
    accent: "#FF9E7D",
    accentSoft: "rgba(255,158,125,0.14)",
    glow: "rgba(255,158,125,0.50)",
    foil: ["#FFCBB0", "#FF9E7D", "#F6C08A"],
  },
  fish: {
    accent: "#6AA8FF",
    accentSoft: "rgba(106,168,255,0.14)",
    glow: "rgba(106,168,255,0.50)",
    foil: ["#AACDFF", "#6AA8FF", "#8FD6FF"],
  },
  shark: {
    accent: "#5FE3D0",
    accentSoft: "rgba(95,227,208,0.14)",
    glow: "rgba(95,227,208,0.50)",
    foil: ["#A9F1E6", "#5FE3D0", "#8FF0DB"],
  },
  whale: {
    accent: "#F5D06B",
    accentSoft: "rgba(245,208,107,0.16)",
    glow: "rgba(245,208,107,0.55)",
    foil: ["#FBE7A6", "#F5D06B", "#F0C24E"],
  },
};

/** Brand-lime theme for the empty/pre-scan card (no tier yet). */
export const NEUTRAL_THEME: CardTheme = {
  accent: CARD_LIME,
  accentSoft: "rgba(198,242,78,0.14)",
  glow: "rgba(198,242,78,0.45)",
  foil: ["#E4FBA8", CARD_LIME, "#B6E84A"],
};

export function cardTheme(tier: Tier): CardTheme {
  return THEMES[tier.id];
}

/** Holographic sheen gradient for foil pills/chips (a white streak mid-way). */
export function foilGradient(theme: CardTheme, angle = 110): string {
  const [a, b, c] = theme.foil;
  return `linear-gradient(${angle}deg, ${a} 0%, ${b} 38%, #FFFFFF 50%, ${b} 62%, ${c} 100%)`;
}
