begin;
do $test$
declare owner_id uuid:='633aadd5-14b9-470e-aa38-2ad4fb1dcf92'; pid uuid; sid uuid; out jsonb;
begin
 insert into public.coach_workout_plans(user_id,title,exercises,notes,status) values(owner_id,'Rollback fixture','[{"exercise":"Fixture","sets":3,"reps":"10–12","weight":13.5,"comment":"Test"}]','Fixture','published') returning id into pid;
 insert into public.sessions(user_id,type,date,title,confirmed,coach_plan_id,base_rows,extra_rows) values(owner_id,'gym','2026-10-16','Rollback fixture',true,pid,'[{"exercise":"Fixture","sets":3,"reps":10,"weight":13.5,"comment":""}]','[]') returning id into sid;
 select exercises into out from public.coach_workout_plans where source_session_id=sid;
 if out is null or out->0->>'weight'<>'13.5' or out->0->>'startReps'<>'11' then raise exception 'next_plan_wrong %',out;end if;
 if (select count(*) from public.coach_workout_plans where source_session_id=sid)<>1 then raise exception 'duplicate_next_plan';end if;
 insert into public.coach_workout_plans(user_id,title,exercises,notes,status) values(owner_id,'Rollback pain fixture','[{"exercise":"Fixture","sets":3,"reps":"10–12","weight":13.5,"comment":"Test"}]','Fixture','published') returning id into pid;
 insert into public.sessions(user_id,type,date,title,confirmed,coach_plan_id,base_rows,extra_rows) values(owner_id,'gym','2026-10-16','Rollback pain fixture',true,pid,'[{"exercise":"Fixture","sets":3,"reps":10,"weight":13.5,"comment":"болит плечо"}]','[]') returning id into sid;
 if exists(select 1 from public.coach_workout_plans where source_session_id=sid) then raise exception 'pain_progression';end if;
end $test$;
rollback;
