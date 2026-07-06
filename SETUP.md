# PerpID — Setup & Launch Guide

Everything needed to run PerpID locally and ship it to `perpid.vercel.app`.

The app is designed to **degrade gracefully** — it runs with zero config (in-memory
storage, manual X handle entry, injected wallets). Each service below unlocks a
better experience. Do them in order.

---

## 0. Environment variables

Copy `.env.example` → `.env.local` and fill in the values below. On Vercel, add
the same keys under **Project → Settings → Environment Variables**.

| Variable | Required? | What it does |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Recommended | Canonical URL used for OG images, share links & QR codes. Set to `https://perpid.vercel.app`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Recommended | Supabase project URL — enables persistent leaderboard/shares. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Recommended | Supabase publishable (anon) key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | Server-side writes bypass RLS. **Secret — never expose client-side.** |
| `X_CLIENT_ID` | Optional | X (Twitter) OAuth 2.0 client id — enables native "Connect 𝕏". |
| `X_CLIENT_SECRET` | Optional | X OAuth 2.0 client secret (confidential client). |
| `NEXT_PUBLIC_WC_PROJECT_ID` | Optional | WalletConnect project id — adds WalletConnect alongside injected wallets. |

> ⚠️ **Rotate the service-role key.** If the key was ever pasted into a chat,
> email, or commit, reset it: **Supabase → Settings → API → `service_role` →
> Reset**, then update `.env.local` and Vercel.

---

## 1. Supabase (leaderboard, shares, volume cache)

Your project already exists and the schema is already applied — the three tables
(`leaderboard`, `shares`, `volume_cache`) are live. If you ever need to recreate
them on a fresh project:

1. Create a project at [supabase.com](https://supabase.com).
2. **Project → SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and **Run**.
3. **Project → Settings → API** — copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **`anon` / publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **`service_role` key** → `SUPABASE_SERVICE_ROLE_KEY`

That's it — persistence now survives restarts and serverless cold starts.

---

## 2. X (Twitter) developer app — native "Connect 𝕏"

This gives users the real one-click **Connect 𝕏** button that pulls their handle,
name, and profile picture. Without it the app falls back to manual handle entry.

### 2a. Create the app

1. Go to the [X Developer Portal](https://developer.x.com/) and sign in.
2. Create a **Project**, then an **App** inside it (Free tier is enough for
   `users.read` / `tweet.read`).
3. Open the app → **User authentication settings** → **Set up**.

### 2b. Configure OAuth 2.0

Fill the form exactly like this:

- **App permissions:** Read
- **Type of App:** **Web App, Automated App or Bot** (this is a *confidential
  client* → you get a Client **Secret**)
- **Callback URI / Redirect URL** — add **both**:
  - `https://perpid.vercel.app/api/x/callback`
  - `http://localhost:3000/api/x/callback` (for local dev)
- **Website URL:** `https://perpid.vercel.app`
- Save.

### 2c. Copy the credentials

On the app's **Keys and tokens** tab, under **OAuth 2.0 Client ID and Client
Secret**, copy:

- **Client ID** → `X_CLIENT_ID`
- **Client Secret** → `X_CLIENT_SECRET`

Restart `npm run dev` (or redeploy). The **Connect 𝕏** button now runs the real
OAuth PKCE flow via `/api/x/login` → `/api/x/callback`.

> The app auto-detects this: if `X_CLIENT_ID` is set it uses native OAuth;
> otherwise it tries Supabase "Sign in with X" (step 2d); otherwise it asks for a
> handle manually. No code changes needed.

### 2d. (Alternative) "Sign in with X" via Supabase

Only needed if you'd rather not run the native flow. Requires an **OAuth 1.0a**
API key/secret from the same X app:

1. X app → **Keys and tokens** → **Consumer Keys** (API Key & Secret).
2. Supabase → **Authentication → Providers → Twitter** → enable, paste the API
   key & secret.
3. Set the X app's OAuth 1.0a callback to
   `https://utcydlsestafopphkijn.supabase.co/auth/v1/callback`.
4. Supabase → **Authentication → URL Configuration** → add
   `https://perpid.vercel.app` (and `http://localhost:3000`) to redirect URLs.

Leave `X_CLIENT_ID` blank to make the app prefer this path.

---

## 3. WalletConnect (optional)

Injected wallets (MetaMask, Rabby, Coinbase Wallet extension) work out of the
box. To also support mobile/WalletConnect wallets:

1. Create a project at [cloud.reown.com](https://cloud.reown.com/) (formerly
   WalletConnect Cloud).
2. Copy the **Project ID** → `NEXT_PUBLIC_WC_PROJECT_ID`.

---

## 4. Run locally

```bash
npm install
npm run dev      # http://localhost:3000
```

For local OAuth/QR testing, set `NEXT_PUBLIC_APP_URL=http://localhost:3000` in
`.env.local` (otherwise share links/QR point at production).

---

## 5. Deploy to `perpid.vercel.app`

1. Push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. **Settings → Domains** — the default `perpid.vercel.app` is assigned when the
   project is named `perpid`. Rename the project if needed so the domain matches.
3. **Settings → Environment Variables** — add every key from section 0
   (Production scope). Set `NEXT_PUBLIC_APP_URL=https://perpid.vercel.app`.
4. Make sure the X app callback (2b) and Supabase redirect URLs (2d) use the
   final domain.
5. **Deploy.**

---

## Launch checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` rotated after any exposure
- [ ] All env vars set in Vercel (Production)
- [ ] `NEXT_PUBLIC_APP_URL` = `https://perpid.vercel.app`
- [ ] X app callback URLs include prod **and** localhost
- [ ] `npm run build` passes (`✓ Compiled successfully`)
- [ ] Connect a wallet → card mints → **Download PNG** matches the on-site card
- [ ] Scan the card's QR → opens the correct `/share/{id}` page
- [ ] Connect a second wallet → volume stacks on the card & leaderboard
