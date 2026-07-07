import type { DexId } from "./types";

/**
 * The venues PerpID counts and displays, with their logo assets
 * (public/dex/{id}.jpg) and fixed positions on the card's orbit. Only venues
 * with a real per-wallet volume source are listed: Hyperliquid + dYdX
 * (public) and Paradex (one signature).
 */
export interface RosterDex {
  id: DexId;
  name: string;
  logo: string;
  angle: number; // degrees on the orbit around the avatar
  accent: string; // brand-ish accent for chips/fallbacks
}

export const V3_DEXES: RosterDex[] = [
  { id: "hyperliquid", name: "Hyperliquid", logo: "/dex/hyperliquid.jpg", angle: -90, accent: "#97FCE4" },
  { id: "dydx", name: "dYdX", logo: "/dex/dydx.jpg", angle: 30, accent: "#968CFF" },
  { id: "paradex", name: "Paradex", logo: "/dex/paradex.jpg", angle: 150, accent: "#C6F24E" },
];
