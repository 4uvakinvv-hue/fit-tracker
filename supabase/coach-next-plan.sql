-- Preserve current rules/preferences; repair overescaped regexes and newlines only.
CREATE OR REPLACE FUNCTION private.forma_autopublish_next_coach_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 parent public.coach_workout_plans%rowtype;
 user_pref private.coach_load_preferences%rowtype;
 wanted text:=left(btrim(coalesce(NEW.coach_feedback,NEW.base_rows->0->>'userWishes','')),1500);
 next_exercises jsonb:='[]'::jsonb;
 item jsonb; fact jsonb; updated jsonb;
 old_note text; comment_text text;
 actual_weight numeric; actual_reps numeric; actual_sets int;
 low_reps int; high_reps int; next_reps int; suggested_weight numeric;
 issue boolean; safety_flags boolean;
 tip text; summary text; i int;
begin
 if NEW.type<>'gym' or NEW.coach_plan_id is null or NEW.confirmed is distinct from true then return NEW; end if;
 select * into parent from public.coach_workout_plans
 where id=NEW.coach_plan_id and user_id=NEW.user_id;
 if not found then return NEW; end if;
 if not exists(select 1 from public.coach_memberships m
 where m.user_id=NEW.user_id and m.status='active' and (m.access_until is null or m.access_until>now())) then return NEW; end if;
 if exists(select 1 from public.coach_workout_plans p where p.source_session_id=NEW.id) then return NEW; end if;
 select * into user_pref from private.coach_load_preferences where user_id=NEW.user_id;
 if not found then
   user_pref.target_sets:=2; user_pref.auto_progress:=false; user_pref.use_rir:=true;
 end if;

 -- Conservative red-flag check; not a medical diagnosis.
 safety_flags:= wanted ~* '\m(боль|боли|болит|болело|травма|травмы|прострел|онемение|головокружение|беременность)\M';
 if safety_flags or exists(select 1 from jsonb_array_elements(coalesce(NEW.base_rows,'[]'::jsonb)) x
  where coalesce(x->>'comment','') ~* '\m(боль|боли|болит|болело|травма|травмы|прострел|онемение|головокружение)\M')
 then return NEW; end if;

 for i in 0..jsonb_array_length(parent.exercises)-1 loop
   item:=parent.exercises->i;
   fact:=coalesce(NEW.base_rows->i,'{}'::jsonb);
   actual_weight:=case when replace(coalesce(fact->>'weight',''),',','.') ~ '^[0-9]{1,4}(\.[0-9]+)?$' then replace(fact->>'weight',',','.')::numeric else null end;
   actual_reps:=case when replace(coalesce(fact->>'reps',''),',','.') ~ '^[0-9]{1,3}(\.[0-9]+)?$' then replace(fact->>'reps',',','.')::numeric else null end;
   actual_sets:=case when coalesce(fact->>'sets','') ~ '^[0-9]{1,2}$' then (fact->>'sets')::int else null end;
   suggested_weight:=case when replace(coalesce(item->>'weight',''),',','.') ~ '^[0-9]{1,4}(\.[0-9]+)?$' then replace(item->>'weight',',','.')::numeric else null end;
   low_reps:=coalesce(((regexp_match(coalesce(item->>'reps',''),'[0-9]+'))[1])::int,10);
   high_reps:=coalesce(((regexp_match(coalesce(item->>'reps',''),'[0-9]+[^0-9]+([0-9]+)'))[1])::int,low_reps+2);
   if high_reps<low_reps then high_reps:=low_reps; end if;
   next_reps:=low_reps;
   comment_text:=left(coalesce(fact->>'comment',''),400);
   old_note:=left(coalesce(item->>'comment',''),900);
   issue:=comment_text ~* '(очень[[:space:]]+тяжел|тяжело|сложно|не[[:space:]]+получилось|рывк|нарушен|нарушилась|нарушение[[:space:]]+техник|не[[:space:]]+могу)';
   if comment_text ~* 'не[[:space:]]+тяжело' then issue:=false; end if;
   tip:='Вес на том же снаряде, перед подходами лёгкая разминка; контроль техники. ';

   -- No equivalent exercise / missing results = no invented growth.
   if nullif(fact->>'exercise','') is distinct from nullif(item->>'exercise','')
        or actual_weight is null or actual_reps is null or actual_sets is null then
      suggested_weight:=coalesce(actual_weight,suggested_weight);
      next_reps:=low_reps;
      tip:=tip||'Не все данные подтверждены или вариант упражнения изменён: сначала проверь индивидуальную нагрузку, не считай назначение фактическим результатом. ';
   elsif issue or actual_reps < low_reps then
      suggested_weight:=actual_weight;
      next_reps:=low_reps;
      tip:=tip||'Отмечена чрезмерная тяжесть/техника либо результат ниже диапазона: НЕ повышай вес; при необходимости уменьши ближайшей ступенью. ';
   elsif user_pref.auto_progress then
      if actual_reps >= high_reps and actual_weight>0 then
        suggested_weight:=round((actual_weight*1.025)*2)/2;
        next_reps:=low_reps;
        tip:=tip||'Прогрессия по весу: ориентир +2,5% (округление до 0,5 кг), выбери ближайшую доступную небольшую ступень и проверь разминкой. Если 3 чистых подхода не получаются, верни прежний вес. ';
      elsif actual_reps>=high_reps then
        suggested_weight:=actual_weight;next_reps:=low_reps;
        tip:=tip||'Упражнение с собственным весом: для повышения сложности используй больше контролируемых повторений или сложность варианта по факту. ';
      else
        suggested_weight:=actual_weight;
        next_reps:=least(high_reps,greatest(low_reps,floor(actual_reps)::int+1));
        tip:=tip||format('Прогрессия повторений: тот же вес, целевой средний результат %s повторений с чистой техникой. ',next_reps);
      end if;
   else
     suggested_weight:=actual_weight;
     tip:=tip||'Нагрузка удержана до экспертного пересмотра. ';
   end if;

   summary:=format('Прошлый факт: %s подходов × %s повторений (среднее) × %s кг. %s',
      coalesce(actual_sets::text,'неизвестно'),coalesce(actual_reps::text,'неизвестно'),
      coalesce(actual_weight::text,'неизвестно'),
      case when comment_text<>'' then 'Комментарий: '||comment_text else '' end);
   updated:=item || jsonb_build_object(
     'sets',user_pref.target_sets,
     'weight',suggested_weight,
     'startReps',next_reps,
     'trainToFailure',false,
     'comment',left(old_note||E'\n'||tip||E'\n'||summary,2200));
   if user_pref.use_rir is false then
     updated:=updated-'targetRir'-'rir'-'setRir';
   end if;
   next_exercises:=next_exercises||jsonb_build_array(updated);
 end loop;

 insert into public.coach_workout_plans(user_id,title,scheduled_date,notes,status,exercises,source_session_id)
 values (NEW.user_id,'Следующая тренировка · прогрессия',null,
    'План сформирован после сохранения подтверждённой тренировки. Каждый полноценный результат без боли, чрезмерной тяжести и нарушений техники ведёт к прогрессии — через увеличение веса либо повторений. '
    ||'Для этих профилей RIR не требуется. В обычных тренировках НЕ ДО ОТКАЗА, отказ только по отдельному явно отмеченному назначению. '
    ||'Прогрессия по весу +2,5% — осторожный рабочий алгоритм, а не универсальный научный закон; техника и комфорт важнее точной цифры. '
    ||'Если недостаточно восстановления или заметное ухудшение самочувствия, перенеси тренировку. Пожелания сохранены для проверки тренером: '
    ||coalesce(nullif(wanted,''),'не указаны')
    ||'. Исходная дата '||NEW.date::text
 , 'published',next_exercises,NEW.id)
 on conflict do nothing;
 return NEW;
end;
$function$
;
