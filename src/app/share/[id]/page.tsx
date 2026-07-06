import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatUsd } from "@/lib/ranks";
import { tierForVolume } from "@/lib/tiers";
import { getShare } from "@/lib/store";
import "../../v3/v3.css";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const share = await getShare(id);
  if (!share) return { title: "Card not found — PerpID" };

  const total = Number(share.total_volume);
  const tier = tierForVolume(total);
  const who = share.x_handle ? `@${share.x_handle}` : "This wallet";
  const title = `${tier.emoji} ${tier.label} — ${formatUsd(total)} lifetime perp volume`;
  const description = `${who} put their entire perp history on one card. How much have you really degen'd?`;

  return {
    title: `${title} | PerpID`,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharePage({ params }: Props) {
  const { id } = await params;
  const share = await getShare(id);
  if (!share) notFound();

  return (
    <div className="v3" style={{ minHeight: "100vh" }}>
      <nav className="v3-nav">
        <Link href="/" className="v3-logo">
          <span className="v3-logo-badge">PerpID</span>
          <span className="v3-logo-sub">your on-chain trading card</span>
        </Link>
      </nav>

      <main
        className="v3-main"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/card/${share.id}`}
          alt={`PerpID card — ${tierForVolume(Number(share.total_volume)).label}, ${formatUsd(Number(share.total_volume))} lifetime perp volume`}
          width={1320}
          height={742}
          style={{
            width: "100%",
            maxWidth: 720,
            height: "auto",
            borderRadius: 20,
            border: "3px solid var(--ink)",
            boxShadow: "8px 8px 0 var(--lime)",
          }}
        />
        <Link href="/" className="v3-cta" style={{ textDecoration: "none" }}>
          Get your card →
        </Link>
      </main>

      <footer className="v3-footer">
        <div>PerpID — read-only, your keys stay yours</div>
        <div>data: Hyperliquid · GMX · dYdX · Paradex</div>
      </footer>
    </div>
  );
}
