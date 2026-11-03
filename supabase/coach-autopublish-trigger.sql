-- Forma: trigger that publishes an automatic conservative next coach plan after a confirmed coach-linked gym session.
-- Function body: supabase/coach-next-plan.sql (private.forma_autopublish_next_coach_plan).
-- Recorded from the live database on 3 Nov 2026. The owner's account is excluded on purpose:
-- the owner's plans are written by a human/AI coach (docs/AI_COACH.md), so the trigger must not publish over them.
drop trigger if exists trg_forma_autopublish_coach_plan on public.sessions;
create trigger trg_forma_autopublish_coach_plan
after insert on public.sessions
for each row
when (new.coach_plan_id is not null and new.confirmed = true and new.type = 'gym'
      and new.user_id <> '633aadd5-14b9-470e-aa38-2ad4fb1dcf92'::uuid)
execute function private.forma_autopublish_next_coach_plan();
