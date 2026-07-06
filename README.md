# Poplytics — Are you worthy of the PopDEX beta?

Check your all-time perpetuals trading volume across major perp DEXs, earn a
Marvel-inspired hero rank (Recruit → Thor LVL 3), and share a snapshot card
with OpenGraph previews for Twitter/Discord. Cross **$69K** all-time volume
and you're WORTHY — PopDEX beta access unlocked.

## Hero ladder

| All-time volume | Hero | Worthy |
| --- | --- | --- |
| $1M+ | Thor · LVL 3 | ⚡ |
| $500K+ | Thor · LVL 2 | ⚡ |
| $69K+ | Thor · LVL 1 | ⚡ |
| $50K+ | Iron Man | — |
| $20K+ | Black Widow | — |
| $1K+ | Hawkeye | — |
| < $1K | Recruit | — |

Edit the ladder in `src/lib/heroes.ts` (names, thresholds, colors — one
place). Avatar images go in `public/heroes/{slug}.png` (thor-1, thor-2,
thor-3, iron-man, black-widow, hawkeye, recruit); missing images fall back
to emoji automatically.

## Verified vs Unverified cards

- **Pasted address** → card is stamped `UNVERIFIED`.
- **Connected wallet** (lookup of your own address) → `✓ VERIFIED`.

The flag flows through the API, the 24h cache (cached separately), the share
snapshot, and the OG image.

## Quick start

```bash
npm install
npm run dev
```

Works out of the box with no configuration — caching and share links fall
back to in-memory storage. For persistence, configure Supabase (below).

## How lookups work

| DEX | Method | Status |
| --- | --- | --- |
| Hyperliquid | Public `portfolio` info endpoint (`allTime.vlm`) | ✅ Live |
| dYdX v4 | Public indexer `affiliates/total_volume` (requires `dydx1...` address) | ✅ Live |
| Lighter | Public L1-address → account mapping; volume needs auth | 🟡 Account detection only |
| Paradex | Private API — JWT from wallet signature (`/api/volume/private`) | 🟠 Endpoint wired, auth flow pending |
| EdgeX | Private API | 🔜 Placeholder |
| Variational | Private API | 🔜 Placeholder |

- **Paste an address** → covers the public-API DEXs.
- **Connect wallet** → auto-looks-up your address; private-API DEXs surface
  as "Auth needed" until their signature flows are completed in
  `src/lib/dex/private.ts` and `/api/volume/private`.

## Configuration

`.env.local` is already wired to the Supabase project with the publishable
key. **Run `supabase/schema.sql` in the Supabase SQL editor once** — until
then the app logs a warning and falls back to in-memory storage (share links
won't survive restarts).

Optional:

- `SUPABASE_SERVICE_ROLE_KEY` — lets you drop the anon write policies from
  the schema.
- `NEXT_PUBLIC_WC_PROJECT_ID` — enables WalletConnect (injected wallets like
  MetaMask work without it).

## Architecture

- `src/lib/dex/` — one adapter per DEX, each returning a normalized
  `DexVolume` (`ok | no_account | auth_required | unsupported | error`).
  `aggregateVolume()` fans out in parallel and sums confirmed volume.
- `src/lib/store.ts` — Supabase-backed cache + share store with an
  in-memory fallback (kept on `globalThis` so all route bundles share it).
- `src/app/api/volume` — public lookup (24h cache, `?fresh=1` to bypass).
- `src/app/api/volume/private` — accepts exchange JWTs obtained client-side
  from wallet signatures; merges private volume into the aggregate.
- `src/app/api/share` — snapshots a result, returns `/share/{id}`.
- `src/app/share/[id]` — server-rendered card page with OG meta tags and a
  generated `opengraph-image` (1200×630) for social previews.

## Verifying

```bash
npm run build && npm start
curl "http://localhost:3000/api/volume?address=0x31ca8395cf837de08b24da3f660e77761dfb974b"
```

That address is a known Hyperliquid whale (~$187B all-time volume) and should
return tier "Leviathan". Manual wallet testing: connect MetaMask on the
landing page — the lookup fires automatically with your address.
