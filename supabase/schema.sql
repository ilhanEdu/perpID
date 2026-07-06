-- PerpID Supabase schema
-- Run in the Supabase SQL editor. The app works with just the publishable
-- (anon) key thanks to the policies below; add SUPABASE_SERVICE_ROLE_KEY to
-- .env.local later if you want to drop the anon write policies.

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

alter table volume_cache enable row level security;
alter table shares enable row level security;
alter table leaderboard enable row level security;
alter table wallet_links enable row level security;

-- Wallet links are public to read; writes go through the service-role key
-- (which bypasses RLS), so there is intentionally no public write policy.
create policy "read wallet_links" on wallet_links for select using (true);

-- Shares are public snapshots; anyone may read, the app inserts them.
create policy "read shares" on shares for select using (true);
create policy "insert shares" on shares for insert with check (true);

-- Cache is written server-side with the anon key (no service key configured).
create policy "read cache" on volume_cache for select using (true);
create policy "insert cache" on volume_cache for insert with check (true);
create policy "update cache" on volume_cache for update using (true);

-- Leaderboard is public; the app upserts rows server-side.
create policy "read leaderboard" on leaderboard for select using (true);
create policy "insert leaderboard" on leaderboard for insert with check (true);
create policy "update leaderboard" on leaderboard for update using (true);
