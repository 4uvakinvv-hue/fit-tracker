-- Paid access is not simulated: all grants are manual trials until a verified payment adapter exists.
create table if not exists public.coach_memberships (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','active','revoked','expired')),
 requested_at timestamptz not null default now(),
 access_until timestamptz,
 granted_by uuid references auth.users(id),
 reminder_sent_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.coach_memberships enable row level security;
revoke all on public.coach_memberships from public,anon,authenticated;
grant select,insert,update,delete on public.coach_memberships to service_role;
insert into public.coach_memberships(user_id,status) values ('633aadd5-14b9-470e-aa38-2ad4fb1dcf92','active') on conflict(user_id) do nothing;
insert into public.coach_memberships(user_id,requested_at) select user_id,min(created_at) from public.trainer_requests where status='new' group by user_id on conflict(user_id) do nothing;
create table if not exists public.coach_notices (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 message text not null,created_at timestamptz not null default now()
);
alter table public.coach_notices enable row level security;
revoke all on public.coach_notices from public,anon,authenticated;
grant select,insert,delete on public.coach_notices to service_role;

create or replace function public.coach_action(p_action text,p_user uuid,p_target uuid default null,p_days integer default 30,p_email text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.coach_memberships; result jsonb; boss constant uuid:='633aadd5-14b9-470e-aa38-2ad4fb1dcf92';
begin
 if p_action in ('list','grant','revoke') and p_user<>boss then raise exception 'Access denied'; end if;
 if p_action='list' then
   select coalesce(jsonb_agg(jsonb_build_object('user_id',c.user_id,'name',coalesce(p.name,'Участник'),'status',c.status,'access_until',c.access_until,'requested_at',c.requested_at) order by c.requested_at desc),'[]'::jsonb) into result from public.coach_memberships c left join public.profiles p on p.id=c.user_id where c.user_id<>boss;
   return jsonb_build_object('members',result);
 end if;
 if p_action='request' then
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  select * into m from public.coach_memberships where user_id=p_user;
  if m.user_id is null or m.status in ('revoked','expired') or (m.status='active' and m.access_until<=now()) then
   insert into public.coach_memberships(user_id,status,requested_at) values(p_user,'pending',now()) on conflict(user_id) do update set status='pending',requested_at=now(),updated_at=now();
   insert into public.trainer_requests(user_id,contact_email,member_name) select p_user,p_email,name from public.profiles where id=p_user;
  end if;
 elsif p_action='grant' then
  if p_target is null or p_target=boss or p_days not in (30,90) then raise exception 'Invalid grant'; end if;
  select * into m from public.coach_memberships where user_id=p_target for update;
  if m.user_id is null then raise exception 'Request required'; end if;
  update public.coach_memberships set status='active',access_until=greatest(now(),case when m.status='active' then coalesce(m.access_until,now()) else now() end)+make_interval(days=>p_days),granted_by=boss,reminder_sent_at=null,updated_at=now() where user_id=p_target;
  update public.trainer_requests set status='contacted' where user_id=p_target and status='new';
  insert into public.coach_notices(user_id,message) values(p_target,'Доступ к тренеру открыт. Тестовый период: '||p_days||' дней.');
 elsif p_action='revoke' then
  if p_target is null or p_target=boss then raise exception 'Invalid target'; end if;
  update public.coach_memberships set status='revoked',updated_at=now() where user_id=p_target;
  insert into public.coach_notices(user_id,message) values(p_target,'Доступ к тренеру закрыт администратором.');
 elsif p_action<>'status' then raise exception 'Invalid action'; end if;
 select * into m from public.coach_memberships where user_id=p_user;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'message',message,'created_at',created_at) order by created_at desc),'[]'::jsonb) into result from (select * from public.coach_notices where user_id=p_user order by created_at desc limit 5) n;
 return jsonb_build_object('owner',p_user=boss,'active',p_user=boss or (m.status='active' and (m.access_until is null or m.access_until>now())),'status',coalesce(m.status,'none'),'access_until',m.access_until,'notices',result);
end $$;
revoke all on function public.coach_action(text,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.coach_action(text,uuid,uuid,integer,text) to service_role;

alter table public.fatsecret_connections add column if not exists last_attempt_at timestamptz;
alter table public.fatsecret_connections add column if not exists last_sync_error text;
create extension if not exists pg_net with schema extensions;
do $$begin
 if not exists(select 1 from vault.secrets where name='forma_fatsecret_schedule') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'forma_fatsecret_schedule');
 end if;
end $$;
create or replace function public.claim_fatsecret_sync(p_secret text,p_user uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='forma_fatsecret_schedule' and decrypted_secret=p_secret) then return false; end if;
 update public.fatsecret_connections f set last_attempt_at=now() where user_id=p_user and access_cipher is not null
 and (last_attempt_at is null or last_attempt_at<now()-interval '30 minutes')
 and exists(select 1 from public.coach_memberships m where m.user_id=f.user_id and m.status='active' and (m.access_until is null or m.access_until>now()));
 return found;
end $$;
revoke all on function public.claim_fatsecret_sync(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_fatsecret_sync(text,uuid) to service_role;
select cron.schedule('forma-fatsecret-auto-sync','15 * * * *',$cron$
 select net.http_post(url:='https://osxxmmutwehabkvylkki.supabase.co/functions/v1/fatsecret',headers:=jsonb_build_object('Content-Type','application/json','X-Forma-Schedule',(select decrypted_secret from vault.decrypted_secrets where name='forma_fatsecret_schedule')),body:=jsonb_build_object('action','sync','user_id',f.user_id),timeout_milliseconds:=120000)
 from public.fatsecret_connections f join public.coach_memberships m using(user_id)
 where f.access_cipher is not null and m.status='active' and (m.access_until is null or m.access_until>now()) and (f.last_synced_at is null or f.last_synced_at<now()-interval '6 hours') and (f.last_attempt_at is null or f.last_attempt_at<now()-interval '30 minutes') limit 10;
$cron$);
select cron.schedule('forma-coach-access-lifecycle','5 * * * *',$cron$
 with due as (update public.coach_memberships set reminder_sent_at=now() where status='active' and access_until>now() and access_until<=now()+interval '3 days' and reminder_sent_at is null returning user_id,access_until)
 insert into public.coach_notices(user_id,message) select user_id,'Доступ к тренеру заканчивается '||to_char(access_until at time zone 'Europe/Moscow','DD.MM.YYYY')||'. Запроси продление у Василия.' from due;
 with expired as (update public.coach_memberships set status='expired',updated_at=now() where status='active' and access_until<=now() returning user_id)
 insert into public.coach_notices(user_id,message) select user_id,'Период доступа к тренеру закончился. Можно отправить заявку на продление.' from expired;
$cron$);

-- Commit a report only if the same connection and entitlement still exist.
create or replace function public.save_fatsecret_snapshot(p_user uuid,p_cipher text,p_payload jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.fatsecret_connections where user_id=p_user and access_cipher=p_cipher for update;
 if not found then return false; end if;
 if not exists(select 1 from public.coach_memberships where user_id=p_user and status='active' and (access_until is null or access_until>now())) then return false; end if;
 insert into public.fatsecret_diary_cache(user_id,payload,fetched_at,expires_at) values(p_user,p_payload,now(),now()+interval '23 hours') on conflict(user_id) do update set payload=excluded.payload,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at;
 update public.fatsecret_connections set last_synced_at=now(),last_sync_error=null where user_id=p_user;
 return true;
end $$;
revoke all on function public.save_fatsecret_snapshot(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_fatsecret_snapshot(uuid,text,jsonb) to service_role;
