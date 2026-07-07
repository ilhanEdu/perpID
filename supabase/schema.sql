-- PerpID Supabase schema
-- Run in the Supabase SQL editor.
--
-- SECURITY: all WRITES go through the server using SUPABASE_SERVICE_ROLE_KEY
-- (which bypasses RLS). There are intentionally NO public insert/update/delete
-- policies — the browser only ever holds the anon key, so a public write policy
-- would let anyone forge leaderboard rows, volume and handles directly against
-- the REST API, bypassing every server-side check. SUPABASE_SERVICE_ROLE_KEY is
-- therefore REQUIRED in .env.local; without it the app degrades to in-memory.

create table if not exists volume_cache (
  cache_key text primary key, -- "{address}:{v|u}" (verified vs unverified)
  result jsonb not null,
  fetched_at timestamptz not null default now()
);

create table if not exists shares (
  id text primary key,
  address text not null,
  total_volume numeric not null,
  breakdown_json jsonb not null,
  hero_name text not null, -- rank name
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  x_handle text,
  x_name text,
  x_avatar text
);

create index if not exists shares_address_idx on shares (address);

-- Migration for pre-existing shares tables:
alter table shares add column if not exists x_handle text;
alter table shares add column if not exists x_name text;
alter table shares add column if not exists x_avatar text;

-- One row per identity, upserted whenever someone generates their card. The
-- row is keyed by a wallet address, but a connected X account owns a single
-- row: its volume is the cumulative sum across every wallet it has linked, and
-- upsertLeaderboard removes any sibling rows the account held under another
-- wallet. Anonymous (no X) rows remain one-per-wallet.
create table if not exists leaderboard (
  address text primary key, -- lowercased wallet address
  total_volume numeric not null default 0,
  score numeric not null default 0,
  rank_name text not null default 'Initiate',
  x_handle text,
  x_name text,
  x_avatar text,
  updated_at timestamptz not null default now()
);

create index if not exists leaderboard_volume_idx on leaderboard (total_volume desc);
create index if not exists leaderboard_handle_idx on leaderboard (lower(x_handle));

-- One-off cleanup for boards that accumulated duplicate rows per X account
-- before the one-identity-per-account rule (keeps each handle's largest row):
delete from leaderboard a
using leaderboard b
where a.x_handle is not null
  and lower(a.x_handle) = lower(b.x_handle)
  and (a.total_volume < b.total_volume
       or (a.total_volume = b.total_volume and a.address > b.address));

-- First X account to link a wallet owns it (anti-abuse). A wallet can never
-- be re-claimed by a different X account. One X account may own many wallets.
create table if not exists wallet_links (
  address text primary key, -- lowercased wallet address
  x_handle text not null,
  created_at timestamptz not null default now()
);

create index if not exists wallet_links_handle_idx on wallet_links (x_handle);

-- Normalize existing leaderboard/wallet_link handles to lowercase so exact
-- (case-insensitive) matching by handle can use `=` instead of ILIKE. ILIKE
-- treats `_` — legal in X handles — as a wildcard, which let one handle match
-- (and the dedupe DELETE wipe) another account's rows. See store.ts.
update leaderboard set x_handle = lower(x_handle) where x_handle is not null;
update wallet_links set x_handle = lower(x_handle);

alter table volume_cache enable row level security;
alter table shares enable row level security;
alter table leaderboard enable row level security;
alter table wallet_links enable row level security;

-- READ-ONLY public access. Every table is public to read (leaderboard, shares
-- and cache are non-sensitive snapshots). All writes require the service-role
-- key, which bypasses RLS — so there are deliberately no public write policies.
-- Drop any permissive write policies left over from earlier versions:
drop policy if exists "insert shares" on shares;
drop policy if exists "insert cache" on volume_cache;
drop policy if exists "update cache" on volume_cache;
drop policy if exists "insert leaderboard" on leaderboard;
drop policy if exists "update leaderboard" on leaderboard;

-- Read policies (drop-then-create so this whole file is safely re-runnable).
drop policy if exists "read wallet_links" on wallet_links;
drop policy if exists "read shares" on shares;
drop policy if exists "read cache" on volume_cache;
drop policy if exists "read leaderboard" on leaderboard;

create policy "read wallet_links" on wallet_links for select using (true);
create policy "read shares" on shares for select using (true);
create policy "read cache" on volume_cache for select using (true);
create policy "read leaderboard" on leaderboard for select using (true);
