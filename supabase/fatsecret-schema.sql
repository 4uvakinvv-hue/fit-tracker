create table if not exists public.fatsecret_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_cipher text,
  pending_cipher text,
  pending_expires_at timestamptz,
  connected_at timestamptz,
  last_synced_at timestamptz
);
alter table public.fatsecret_connections enable row level security;
revoke all on public.fatsecret_connections from anon, authenticated;
grant select,insert,update,delete on public.fatsecret_connections to service_role;
create table if not exists public.fatsecret_diary_cache (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  fetched_at timestamptz not null,
  expires_at timestamptz not null,
  constraint fatsecret_cache_ttl check (expires_at <= fetched_at + interval '23 hours 1 minute')
);
alter table public.fatsecret_diary_cache enable row level security;
revoke all on public.fatsecret_diary_cache from anon,authenticated;
grant select on public.fatsecret_diary_cache to authenticated;
grant select,insert,update,delete on public.fatsecret_diary_cache to service_role;
create policy "Owner reads fresh FatSecret report" on public.fatsecret_diary_cache for select to authenticated
  using ((select auth.uid())=user_id and expires_at>now());
-- FatSecret permits caching for up to 24 hours. 23h expiry + hourly cleanup.
select cron.schedule('forma-fatsecret-cache-cleanup','0 * * * *',
  $$delete from public.fatsecret_diary_cache where expires_at<=now();
    update public.fatsecret_connections set pending_cipher=null,pending_expires_at=null where pending_expires_at<=now();$$);
