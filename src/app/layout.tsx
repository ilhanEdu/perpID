import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { APP_URL } from "@/lib/appUrl";

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
  title: "PerpID — your on-chain trading card",
  description:
    "Prove your wallets, then aggregate your lifetime perp volume across Hyperliquid, GMX, dYdX and Paradex into one shareable card and a public leaderboard.",
  openGraph: {
    title: "PerpID — your on-chain trading card",
    description:
      "One signature to prove the wallet's yours. Four perp DEXes. Your entire perp history on one shareable card.",
  },
};

export const viewport: Viewport = {
  themeColor: "#faf6ec",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bricolage.variable} ${plexMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
