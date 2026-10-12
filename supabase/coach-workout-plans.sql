-- Apply once; inspect existing policies before reapplying.
create table if not exists public.coach_workout_plans (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null,
 scheduled_date date,
 exercises jsonb not null check(jsonb_typeof(exercises)='array' and jsonb_array_length(exercises) between 1 and 30),
 notes text not null default '',
 status text not null default 'published' check(status in ('published','archived')),
 created_at timestamptz not null default now()
);
create index if not exists coach_workout_plans_user_created on public.coach_workout_plans(user_id,created_at desc);
alter table public.coach_workout_plans enable row level security;
revoke all on public.coach_workout_plans from anon,authenticated;
grant select on public.coach_workout_plans to authenticated;
grant select,insert,update,delete on public.coach_workout_plans to service_role;
-- Membership rows are intentionally private; expose only the caller's access boolean.
create schema if not exists private;
grant usage on schema private to authenticated,service_role;
create or replace function private.coach_access_active() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.coach_memberships m where m.user_id=auth.uid() and m.status='active' and (m.access_until is null or m.access_until>now()));
$$;
revoke all on function private.coach_access_active() from public,anon;
grant execute on function private.coach_access_active() to authenticated,service_role;
create policy "Member reads own coach plans" on public.coach_workout_plans for select to authenticated using ((select auth.uid())=user_id and (select private.coach_access_active()));
alter table public.sessions add column if not exists coach_plan_id uuid references public.coach_workout_plans(id);
create unique index if not exists one_completed_session_per_coach_plan on public.sessions(user_id,coach_plan_id) where coach_plan_id is not null and confirmed=true;

create or replace function private.coach_plan_owned(p_plan uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.coach_workout_plans where id=p_plan and user_id=auth.uid());
$$;
revoke all on function private.coach_plan_owned(uuid) from public,anon;
grant execute on function private.coach_plan_owned(uuid) to authenticated,service_role;
create policy "Coach completion requires own active plan" on public.sessions as restrictive for insert to authenticated with check (coach_plan_id is null or ((select private.coach_access_active()) and private.coach_plan_owned(coach_plan_id)));
create policy "Coach history keeps plan ownership" on public.sessions as restrictive for update to authenticated using (coach_plan_id is null or private.coach_plan_owned(coach_plan_id)) with check (coach_plan_id is null or private.coach_plan_owned(coach_plan_id));
