import type { Metadata } from "next";
import { V3App } from "./v3/V3App";
import "./v3/v3.css";

export const metadata: Metadata = {
  title: "PerpID — your on-chain trading card",
  description:
    "One wallet signature. Four perp DEXes. Your entire perp history on one shareable card.",
  openGraph: {
    title: "PerpID — your on-chain trading card",
    description:
      "One wallet signature. Four perp DEXes. Your entire perp history on one shareable card.",
  },
};

export default function Home() {
  return (
    <div className="v3">
      <nav className="v3-nav">
        <div className="v3-logo">
          <div className="v3-logo-badge">PerpID</div>
          <div className="v3-logo-sub">your on-chain trading card</div>
        </div>
        <div className="v3-nav-right">
          <a href="#leaderboard">Leaderboard</a>
          <a href="#build" className="v3-cta">
            Get your card
          </a>
        </div>
      </nav>

      <V3App />

      <footer className="v3-footer">
        <div>PerpID — read-only, your keys stay yours</div>
        <div>data: Hyperliquid · GMX · dYdX · Paradex</div>
      </footer>
    </div>
  );
}
