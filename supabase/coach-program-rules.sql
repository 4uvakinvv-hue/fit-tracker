-- Forma: standing coach program rules per member (applied as migration `coach_program_rules`, 3 Nov 2026).
-- One text document per user: cycle, priorities, day layout, preferences. Read before writing coach_workout_plans.
-- Server-only: no grants to anon/authenticated; the client app never reads it. Content is personal and is NOT stored in this repository.
create table if not exists private.coach_program_rules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rules text not null,
  updated_at timestamptz not null default now()
);
alter table private.coach_program_rules enable row level security;
revoke all on table private.coach_program_rules from public, anon, authenticated;
comment on table private.coach_program_rules is 'Постоянные правила программы тренера для конкретного пользователя (цикл, приоритеты, раскладка дней, предпочтения). Читать перед составлением coach_workout_plans и обновлять при каждом новом решении владельца. Клиентскому приложению недоступно.';
