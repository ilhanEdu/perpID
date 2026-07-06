import type { Metadata } from "next";
import "./v3.css";

export const metadata: Metadata = {
  title: "PerpID — your on-chain trading card",
  description:
    "One wallet signature. Four perp DEXes. Your entire perp history on one shareable card.",
};

export default function V3Layout({ children }: { children: React.ReactNode }) {
  return <div className="v3">{children}</div>;
}
