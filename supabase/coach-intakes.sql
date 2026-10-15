-- Forma coach intake: schema and conservative first plan.
-- Applied to Supabase via migration "coach_intake_secure_first_workout".
-- This file documents the corresponding reproducible DDL.
CREATE TABLE IF NOT EXISTS public.coach_intakes (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 age_years smallint NOT NULL CHECK(age_years BETWEEN 18 AND 100),
 sex text NOT NULL CHECK(sex IN ('female','male','unspecified')),
 experience text NOT NULL CHECK(experience IN ('beginner','some','experienced')),
 goal text NOT NULL CHECK(goal IN ('glutes','hypertrophy','strength','fat_loss','fitness')),
 sessions_per_week smallint NOT NULL CHECK(sessions_per_week BETWEEN 1 AND 6),
 limitations text NOT NULL CHECK(limitations IN ('none','needs_review')),
 preferences text NOT NULL DEFAULT '' CHECK(char_length(preferences)<=1200),
 review_notes text NOT NULL DEFAULT '' CHECK(char_length(review_notes)<=1200),
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','ready','review')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coach_intakes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_intakes FROM anon;
GRANT SELECT,INSERT ON public.coach_intakes TO authenticated;
DROP POLICY IF EXISTS "coach_intakes_own_select" ON public.coach_intakes;
DROP POLICY IF EXISTS "coach_intakes_own_insert" ON public.coach_intakes;
CREATE POLICY "coach_intakes_own_select" ON public.coach_intakes FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()));
CREATE POLICY "coach_intakes_own_insert" ON public.coach_intakes FOR INSERT TO authenticated
 WITH CHECK (user_id=(SELECT auth.uid()) AND (SELECT private.coach_access_active()));

CREATE OR REPLACE FUNCTION private.forma_coach_intake_initial_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 items text[]; targets text[]; output jsonb:='[]'::jsonb;
 i integer; set_count integer; title_text text;
BEGIN
 IF NEW.limitations='needs_review' THEN
  UPDATE public.coach_intakes SET status='review' WHERE user_id=NEW.user_id;
  RETURN NEW;
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.coach_memberships
   WHERE user_id=NEW.user_id AND status='active'
   AND (access_until IS NULL OR access_until>now())
 ) THEN RETURN NEW; END IF;
 IF EXISTS (SELECT 1 FROM public.coach_workout_plans
  WHERE user_id=NEW.user_id AND status='published') THEN
  UPDATE public.coach_intakes SET status='ready' WHERE user_id=NEW.user_id;
  RETURN NEW;
 END IF;
 set_count:=CASE WHEN NEW.experience='beginner' THEN 2 ELSE 3 END;
 IF NEW.goal='glutes' THEN
  title_text:='Ягодицы и спина';
  items:=ARRAY['Ягодичный мост в тренажёре','Жим ногами','Сгибание ног в тренажёре','Разведение ног в тренажёре','Вертикальная тяга блока к груди','Горизонтальная тяга с опорой груди','Отведение ноги назад на блоке'];
  targets:=ARRAY['10–12','10–12','12–15','12–15','10–12','10–12','12–15'];
 ELSIF NEW.goal IN ('hypertrophy','strength') THEN
  title_text:=CASE WHEN NEW.goal='strength' THEN 'Возвращение силы' ELSE 'Набор мышц' END;
  items:=ARRAY['Жим ногами','Жим в грудном тренажёре','Вертикальная тяга блока к груди','Горизонтальная тяга с опорой груди','Махи гантелями в стороны','Сгибание рук на блоке','Разгибание рук на блоке'];
  targets:=ARRAY['10–12','8–12','10–12','10–12','12–15','10–12','10–12'];
 ELSE
  title_text:=CASE WHEN NEW.goal='fat_loss' THEN 'Силовая основа · снижение жира' ELSE 'Общая форма' END;
  items:=ARRAY['Жим ногами','Жим в грудном тренажёре','Тяга вертикального блока','Сгибание ног в тренажёре','Горизонтальная тяга с опорой груди','Разведение ног в тренажёре'];
  targets:=ARRAY['10–12','10–12','10–12','12–15','10–12','12–15'];
 END IF;
 FOR i IN 1..array_length(items,1) LOOP
  output:=output||jsonb_build_array(jsonb_build_object(
   'exercise',items[i],'sets',set_count,'reps',targets[i],
   'weight',null,'trainToFailure',false,
   'comment','Первая тренировка: подбери свой вес на разминке. Не до отказа. При боли останови упражнение. Укажи реальные результаты.'));
 END LOOP;
 INSERT INTO private.coach_load_preferences(user_id,target_sets,use_rir,auto_progress)
 VALUES(NEW.user_id,set_count,false,true) ON CONFLICT(user_id) DO NOTHING;
 INSERT INTO public.coach_workout_plans(user_id,title,scheduled_date,notes,status,exercises)
 VALUES(NEW.user_id,'Первая тренировка · '||title_text,NULL,
  'Первая индивидуальная тренировка. Цель: '||title_text||
  '. Частота: '||NEW.sessions_per_week||'/нед. Пожелания: '||
  coalesce(nullif(NEW.preferences,''),'не указаны')||
  '. Разминка 5–10 мин и разминочные подходы. Не до отказа. Исходные рабочие веса неизвестны. '
  ||'При чрезмерной усталости можно сократить тренировку. При травмах/боли план требует пересмотра.',
  'published',output);
 UPDATE public.coach_intakes SET status='ready' WHERE user_id=NEW.user_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.forma_coach_intake_initial_plan() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_forma_coach_intake_initial_plan ON public.coach_intakes;
CREATE TRIGGER trg_forma_coach_intake_initial_plan AFTER INSERT ON public.coach_intakes
 FOR EACH ROW EXECUTE FUNCTION private.forma_coach_intake_initial_plan();
