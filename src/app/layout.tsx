import type { Metadata, Viewport } from "next";
import {
  Bricolage_Grotesque,
  Geist,
  Geist_Mono,
  IBM_Plex_Mono,
  Orbitron,
  Space_Grotesk,
} from "next/font/google";
import "./globals.css";
import "./app.css";
import { Providers } from "./providers";
import { APP_URL } from "@/lib/appUrl";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-brico",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "PerpID — Build your verified trading reputation",
  description:
    "PerpID aggregates your on-chain perp trading across Hyperliquid, dYdX, Lighter, Paradex and more into one verified Trader Score. Prove it. Share it. Unlock access with it.",
  openGraph: {
    title: "PerpID — Build your verified trading reputation",
    description:
      "One verified Trader Score across every perp DEX. GitHub is for devs. LinkedIn is for suits. PerpID is for traders.",
  },
};

export const viewport: Viewport = {
  themeColor: "#05060f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${orbitron.variable} ${bricolage.variable} ${plexMono.variable}`}
    >
      <body>
        <div className="bg-grid" aria-hidden />
        <div className="bg-stars" aria-hidden />
        <div className="bg-stars bg-stars-far" aria-hidden />
        <div className="orb orb-purple" aria-hidden />
        <div className="orb orb-cyan" aria-hidden />
        <div className="orb orb-gold" aria-hidden />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
