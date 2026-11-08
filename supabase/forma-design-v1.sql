-- FORMA Design v1.0: personal quick activities and optional public community avatar.
-- Apply once to the FORMA project via an authorized migration after reviewing PR.
-- Additive only. No existing profiles, workouts, scores, or plans are rewritten.

create table if not exists public.forma_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  quick_activities text[] not null default array['gym','bike']::text[],
  updated_at timestamptz not null default now(),
  constraint forma_preferences_allowed_activities check (
    quick_activities <@ array[
      'gym','bike','hike','run','crossfit','flaneuring','workout','combat'
    ]::text[] and array_position(quick_activities,null) is null
  )
);
alter table public.forma_preferences enable row level security;
drop policy if exists forma_preferences_select on public.forma_preferences;
create policy forma_preferences_select on public.forma_preferences for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists forma_preferences_insert on public.forma_preferences;
create policy forma_preferences_insert on public.forma_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists forma_preferences_update on public.forma_preferences;
create policy forma_preferences_update on public.forma_preferences for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select,insert,update on public.forma_preferences to authenticated;

-- Profile images shown to signed-in users in the leaderboard.
create table if not exists public.forma_profile_avatars (
  user_id uuid primary key references auth.users(id) on delete cascade,
  avatar_path text not null,
  updated_at timestamptz not null default now(),
  constraint forma_avatar_user_folder check (
    split_part(avatar_path,'/',1) = user_id::text
    and avatar_path ~ '^[a-f0-9-]{36}/avatar-[a-f0-9-]{36}\.webp$'
  )
);
alter table public.forma_profile_avatars enable row level security;
drop policy if exists forma_profile_avatars_read on public.forma_profile_avatars;
create policy forma_profile_avatars_read on public.forma_profile_avatars for select to authenticated
  using (true);
drop policy if exists forma_profile_avatars_insert on public.forma_profile_avatars;
create policy forma_profile_avatars_insert on public.forma_profile_avatars for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists forma_profile_avatars_update on public.forma_profile_avatars;
create policy forma_profile_avatars_update on public.forma_profile_avatars for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists forma_profile_avatars_delete on public.forma_profile_avatars;
create policy forma_profile_avatars_delete on public.forma_profile_avatars for delete to authenticated
  using ((select auth.uid()) = user_id);
grant select,insert,update,delete on public.forma_profile_avatars to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('forma-avatars','forma-avatars',true,2097152,array['image/webp'])
on conflict (id) do update set
  public=excluded.public,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists forma_avatars_insert on storage.objects;
create policy forma_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id='forma-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[a-f0-9-]{36}/avatar-[a-f0-9-]{36}\.webp$');
drop policy if exists forma_avatars_delete on storage.objects;
create policy forma_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id='forma-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No authenticated SELECT policy needed: this avatar-only bucket uses public URLs,
-- while deletes remain restricted to the uploader's folder.


-- Read-only, minimal community activity summary. No comments, routes, coordinates,
-- distances, or private training notes are returned. Authenticated members only.
-- SECURITY DEFINER is required because sessions SELECT RLS is owner-only.
create or replace function public.forma_member_latest_activity()
returns table(user_id uuid, activity_type text, activity_date date)
language sql stable security definer set search_path=''
as $$
  select distinct on (s.user_id)
    s.user_id, s.type::text, s.date
  from public.sessions s
  where (select auth.uid()) is not null
    and s.confirmed = true
    and coalesce(s.rating_eligible,true) = true
  order by s.user_id,s.date desc,s.created_at desc;
$$;
revoke all on function public.forma_member_latest_activity() from public,anon;
grant execute on function public.forma_member_latest_activity() to authenticated;
