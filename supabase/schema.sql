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

-- One row per wallet; upserted whenever someone generates their card.
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

alter table volume_cache enable row level security;
alter table shares enable row level security;
alter table leaderboard enable row level security;

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
