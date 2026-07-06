<div align="center">
  <img src="public/appicon.png" alt="PerpID" width="88" height="88" />

  <h1>PerpID</h1>

  <p><strong>Your on-chain trading card.</strong> Connect X + wallet, and PerpID reads your lifetime
  perpetuals volume across the top perp DEXes into one verified, shareable trading card — plus a public leaderboard.</p>

  <p>
    <a href="https://perpid.vercel.app"><b>Live app →</b></a>
  </p>

  <sub>Next.js 16 · React 19 · TypeScript · wagmi · Supabase · <code>next/og</code></sub>
</div>

---

## What it is

GitHub is for devs. LinkedIn is for suits. **PerpID is for traders.**

It aggregates your on-chain perp activity into a single **Trader Score** and a holographic,
tier-themed card you can download or share. Everything is **read-only** — no approvals, no
transactions, no custody. The only optional interaction is a single message signature to unlock
private venues (Paradex).

## Features

- **One card, four DEXes** — lifetime volume from Hyperliquid, GMX, dYdX, and Paradex, merged into one score.
- **One-signature unlock** — Paradex volume is fetched via a StarkKey derived from a single EIP-712 signature; no keys ever leave the browser.
- **Multi-wallet** — connect several wallets (injected or WalletConnect); their volume stacks onto the same card.
- **Holographic foil card** — tier-driven accents (🦐 → 🐟 → 🦈 → 🐋), a subtle foil texture, a real QR code, and an interactive 3D tilt. The downloadable/OG PNG is rendered server-side with [`next/og`](https://nextjs.org/docs/app/api-reference/functions/image-response) so it matches the live card pixel-for-pixel.
- **Public leaderboard** — ranked by total volume, personalized with your X handle + avatar.
- **Anti-abuse ownership** — the first X account to link a wallet owns it; no other account can claim it.
- **"Sign in with X"** — native OAuth 2.0 (PKCE), with graceful fallbacks.

## How it works

### Data sources

All volume is read from public or wallet-authorized APIs — PerpID never asks for exchange API keys it can't justify.

| DEX | Source | Notes |
| --- | --- | --- |
| **Hyperliquid** | Public `POST /info` portfolio endpoint | Lifetime volume, wallet age, active days |
| **GMX** | Public GMX Synthetics subgraph (Arbitrum) | On-chain, keyed by account |
| **dYdX v4** | Public indexer (`affiliates/total_volume`) | Requires a `dydx1…` address (no EVM mapping) |
| **Paradex** | Private fills API | Unlocked by one wallet signature → short-lived JWT |

### Trader Score & tiers

A pure, isomorphic scoring engine ([`src/lib/score.ts`](src/lib/score.ts)) weights volume, trading days,
wallet age, protocol coverage, consistency, and diversity into a `0–100` score. Volume tiers:

| Tier | Threshold |
| --- | --- |
| 🦐 SHRIMP | `< $100K` |
| 🐟 FISH | `< $10M` |
| 🦈 SHARK | `< $75M` |
| 🐋 WHALE | `≥ $75M` |

### Request flow

```
connect wallet ──> /api/volume        (public scan, cached 24h)
               └─> /api/volume/private (optional: Paradex JWT / dYdX address, merged additively)
generate card ──> /api/share          (snapshot → /share/{id}, OG image)
               └─> /api/leaderboard    (upsert, enforces wallet ↔ X ownership)
download PNG  ──> /api/card/{id}       (next/og render)
```

## Tech stack

- **Framework** — [Next.js 16](https://nextjs.org) (App Router, Turbopack), React 19, TypeScript
- **Wallet** — [wagmi](https://wagmi.sh) + [viem](https://viem.sh), WalletConnect, injected (EIP-6963)
- **Data** — [Supabase](https://supabase.com) (Postgres + RLS) with an in-memory fallback for local dev
- **Card rendering** — [`next/og`](https://vercel.com/docs/functions/og-image-generation) (Satori) + [`qrcode`](https://www.npmjs.com/package/qrcode)
- **Exchange SDKs** — [`@paradex/sdk`](https://github.com/tradeparadex), `lighter-ts-sdk`
- **Hosting** — Vercel

## Project structure

```
src/
├── app/
│   ├── page.tsx                # entry — renders the card builder + leaderboard
│   ├── layout.tsx              # root layout, metadata, fonts
│   ├── v3/                     # V3App, V3Card + styles (the live app UI)
│   ├── share/[id]/             # public share page + OG image
│   └── api/
│       ├── volume/             # public scan + private (signature/address) merge
│       ├── share/              # snapshot a card
│       ├── leaderboard/        # ranked board + ownership enforcement
│       ├── card/[id]/          # downloadable PNG (next/og)
│       └── x/                  # OAuth 2.0 login / callback / session / profile
├── components/                 # WalletIcons, Icons, Logo, …
└── lib/
    ├── dex/                    # per-DEX fetchers + multi-wallet merge
    ├── score.ts · tiers.ts     # Trader Score + tier logic
    ├── cardTheme.ts            # shared card theme (live + OG parity)
    ├── og-card.tsx             # Satori card renderer
    ├── store.ts                # Supabase data layer (cache, shares, board, links)
    └── paradex.ts · wagmi.ts   # signature unlock + wallet config
supabase/schema.sql             # tables, indexes, RLS policies
```

## Getting started

### Prerequisites

- Node.js 20+
- npm
- (Optional) A [Supabase](https://supabase.com) project, an [X developer app](https://developer.x.com), and a [WalletConnect](https://cloud.reown.com) project — the app degrades gracefully without them.

### Run locally

```bash
git clone https://github.com/ilhanEdu/perpID.git
cd perpID
npm install
cp .env.example .env.local   # fill in what you have (all optional)
npm run dev                  # http://localhost:3000
```

The app runs with **zero config** (in-memory storage, injected wallets, manual X handle entry). Each service below unlocks a better experience — see **[SETUP.md](SETUP.md)** for the full walkthrough (Supabase schema, X OAuth, WalletConnect, Vercel).

### Environment variables

| Variable | Required | Purpose |
| --- | :---: | --- |
| `NEXT_PUBLIC_APP_URL` | rec. | Canonical URL for OG images, share links, QR codes |
| `NEXT_PUBLIC_SUPABASE_URL` | rec. | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | rec. | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | rec. | Server-side writes (bypasses RLS) — **secret** |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | opt. | Native "Connect X" OAuth 2.0 |
| `NEXT_PUBLIC_WC_PROJECT_ID` | opt. | Enables WalletConnect |

`NEXT_PUBLIC_*` values are public by design; `SUPABASE_SERVICE_ROLE_KEY` and `X_CLIENT_SECRET` are server-only and must never be committed.

### Scripts

```bash
npm run dev     # dev server
npm run build   # production build
npm run start   # serve the production build
npm run lint    # eslint
```

## Deployment

Deployed on **Vercel**. Import the repo, add the environment variables above (Production scope), set
`NEXT_PUBLIC_APP_URL` to your domain, and register `https://<domain>/api/x/callback` in your X app.
Apply [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL editor to enable persistence.

## Security & privacy

- **Read-only.** PerpID never requests token approvals, sends transactions, or moves funds.
- **No key custody.** The Paradex unlock derives a StarkKey from one signature client-side; only a short-lived JWT reaches the server, and it is never stored.
- **Minimal identity.** Only your X `handle`, `name`, and `avatar` are kept (in an httpOnly cookie) to personalize the card.
- **Ownership binding.** A wallet can be linked to exactly one X account (first-come), enforced server-side.

> ⚠️ **Disclaimer.** PerpID is an indie, unaudited side-project. It is read-only and designed to be safe,
> but it has not undergone a formal security review. Connect only a wallet you're comfortable with.

## Roadmap

- [ ] Signature proof-of-ownership on wallet link (beyond first-come binding)
- [ ] Additional venues as public wallet-keyed APIs become available
- [ ] Solana perps (Drift, Jupiter) once address mapping is solved

## License

MIT
