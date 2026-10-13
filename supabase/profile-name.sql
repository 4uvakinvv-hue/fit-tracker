-- Display name only. Profiles remain read-only for browser clients.
alter table public.profiles add column if not exists name_changed_at timestamptz;

create or replace function private.change_profile_name(p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_name text := regexp_replace(btrim(p_name), '[[:space:]]+', ' ', 'g');
  v_now timestamptz;
begin
  if v_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 60 or v_name ~ '[[:cntrl:]]' then
    raise exception 'invalid_profile_name' using errcode='22023';
  end if;
  select * into v_profile from public.profiles where id=v_id for update;
  if not found then raise exception 'profile_not_found' using errcode='P0002'; end if;
  v_now := clock_timestamp();
  if v_name = v_profile.name then
    return jsonb_build_object('ok',true,'name',v_profile.name,'name_changed_at',v_profile.name_changed_at,'changed',false);
  end if;
  if v_profile.name_changed_at is not null and v_profile.name_changed_at + interval '24 hours' > v_now then
    return jsonb_build_object('ok',false,'reason','cooldown','next_allowed_at',v_profile.name_changed_at + interval '24 hours');
  end if;
  update public.profiles set name=v_name,name_changed_at=v_now,updated_at=v_now where id=v_id;
  return jsonb_build_object('ok',true,'name',v_name,'name_changed_at',v_now,'changed',true);
end;
$$;
revoke all on function private.change_profile_name(text) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.change_profile_name(text) to authenticated;

create or replace function public.change_profile_name(p_name text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.change_profile_name(p_name);
$$;
revoke all on function public.change_profile_name(text) from public,anon;
grant execute on function public.change_profile_name(text) to authenticated;
