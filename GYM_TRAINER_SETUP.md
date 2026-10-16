# Forma 2.1 gym and coach workouts

## Persistent draft contract
Manual modes (chest/back/legs/custom) write synchronously to `localStorage` after each exercise, count, weight, or comment change. Keys include authenticated user ID, mode, date and muscle group. Selection is restored; separate dates/groups/users never share a draft. The last unfinished manual date can be resumed when reopening today's gym screen. External template refreshes do not reset active input. Drafts survive screen lock, component destruction and app/browser restart on the same device; clearing browser/app storage or reinstalling removes them. There is no cross-device draft sync.

Coach drafts use user ID and immutable plan ID and keep a pointer to an unfinished plan. A newer plan must not replace an active draft. Assigned values (`targetSets`, `targetReps`, `targetWeight`, `coachNote`) are separate from actual counts/weight/comments; numeric input fields are prefilled with suggestions (sets, lower/start rep target, weight). They are editable drafts until the user explicitly confirms Save; prefill is never itself a performance record. Average repetitions may be decimal. Per-set input is not shown at Vasiliy’s request. Existing optional `setRir` data is retained in old drafts/history, never inferred from empty comments. Legacy blank coach drafts are migrated once; entered values and comments remain intact, and deliberately cleared fields in the new format remain cleared.

A draft does not insert a session, update ratings, or complete a schedule. Only “Сохранить тренировку” commits actual results. The persisted draft UUID is reused as session ID on retries. The Save button guards simultaneous submissions; a duplicate session ID can finish post-save bookkeeping without inserting or awarding again. Failed saves retain drafts. Decimal commas normalize to periods. Explicit per-hand bilateral exercises carry `weightBasis:"per_hand"`; tonnage counts both sides, while displayed kilograms remain per hand. Existing unknown weight conventions must not be guessed.

Coach training is a dedicated app screen, with a collapsed general-recommendations button, short technique cues and complete original instructions available under Details. Comments open via a small icon. Numeric input remains three aggregate fields per exercise, not one record per set.

## Exercise selection
`src/exercise-catalog.js` contains 150+ text-only variants and retained legacy names. `ExercisePicker` opens a scrollable dialog with search at the top, current/history names, and optional custom-name selection. An exercise absent from the catalog must still display its original stored title. Manual muscle categories remain four; coach training is a separate entry from Gym and the trainer portal.

## Publishing a coach plan
Apply `supabase/coach-workout-plans.sql` once with an authorized DB administrator. This creates `public.coach_workout_plans`, private authorization helpers, and the optional session foreign key/unique completion index. Existing applied policies should be inspected before running schema SQL again. Plans are server-published; members may only read their own while access is active. Database policies also reject linking someone else's plan to a new or edited session. Private helper functions bind all decisions to `auth.uid()`; no exposed SECURITY DEFINER RPC is added.

A trainer/automation may insert one immutable plan for the authorized user through the database connector. Required fields:

```json
{
  "user_id": "633aadd5-14b9-470e-aa38-2ad4fb1dcf92",
  "title": "Полное тело · следующая тренировка",
  "scheduled_date": null,
  "notes": "Общая цель, условия уменьшения нагрузки, отдых и краткое обоснование.",
  "status": "published",
  "exercises": [
    {"exercise":"Точное название и вариант","sets":2,"reps":"10–12","weight":0,"targetRir":"3–4","comment":"Техника, ощущения, отдых и конкретный алгоритм изменения веса."}
  ]
}
```

Example weight 0 above is only a schema example, never a load recommendation. For a unilateral movement performed on both sides, specify `weightBasis:"per_hand"` and state the weight convention explicitly. If the load applies to total plates/machine stack instead, explain it in comment. Never invent comparability between machines or attach scientific certainty to guessed weights.

Do not insert the plan into `sessions` or overwrite `gym_templates`/an unfinished draft. Do not populate actual performance or ratings. Existing history remains unchanged when a new plan arrives. A completed plan is shown as completed rather than available to save again. Create a new plan ID for a subsequent repeat of the same program. Archive superseded unstarted plans if needed only after checking unfinished drafts cannot be inspected remotely; never delete plans referenced by history. The client retains unfinished local plans independently.

## Current Vasiliy context, 12 October 2026
42 years,184 cm, >20 years training experience,6 months away from regular gym. Today's full-body session went well overall, avoided deliberate failure; empty comments mean no notable complaints in this session only, not known RIR. There should be two more full-body sessions this week. Choose spacing and progression based on recovery, not experience alone.

Confirmed actual session (all kg): leg press3×12×180; chest machine3×10×80; vertical pull3×10×66; chest-supported horizontal machine row one arm2×8×30 per arm, very hard; leg curl3×12×41; lateral raise3×12×8; cable biceps3×12×13.5; cable triceps3×9×29.3. These are observations, not guaranteed safe targets on a different machine. No exact RIR was reported. The saved session and custom template have been corrected to13.5 and the actual row variant; never revert to135.

Weight reduction remains primary, preserving/regaining muscle. Around92kg gradually increase hypertrophy emphasis; below90kg hypertrophy becomes main training emphasis while maintaining weight<90; ideal85kg. Read fresh FatSecret weights each review rather than assuming an older spoken value. No current calorie tracking: reducing unwanted foods and including protein each meal. Do not pretend he is already following the historical calorie protocol. Refeed preference remains agreed for the later counted-calorie phase, not a current intervention.

Old-school exercise variants are a preference, not a reason for random changes. Keep enough stable exercises to measure progress; vary load/reps/volume/selection for a stated purpose. Muscle size does not dictate a universal10-versus12 rep rule. Treat practical progression thresholds as configurable coaching choices, not universal research results.

Cycling weekly target50km is a flexible orientation; usual after-work ride15–20km, mostly level with a final climb. Tomorrow13October is a user-declared day without gym; suggest a comfortable ride if recovered. Do not treat kilometres as a debt or prescribe a hard compensatory ride. Before reminders, read actual completed bike sessions for Moscow Monday–Sunday; exclude plans/future/unconfirmed rows. Evening reminders and the midnight coach-plan preparation are created in the main trainer conversation. An app build does not create scheduled ChatGPT tasks.

## Coach wishes and automatic follow-up (15 October 2026)

- Every authorized coach-screen draft has one optional free-text «Пожелания к следующей тренировке» textarea at the end. It persists in the same on-device coach draft and is submitted only when the user confirms Save.
- The wishlist is stored in the first gym-result JSON row as `userWishes`, and an authorized BEFORE INSERT trigger copies it into `sessions.coach_feedback`. This avoids changing unrelated legacy manual gym saves.
- A server-side AFTER INSERT trigger on confirmed coach-linked gym sessions builds a new immutable `coach_workout_plans` row with `source_session_id` pointing at the saved session. A unique index prevents multiple plans from one source. Old history, uncompleted drafts and the completed plan remain intact.
- On reopening «Тренировка от тренера», the existing client fetch selects the latest published plan. There is no paid LLM API on the server. Automatic generation is deliberately conservative: preserve exercises, use actual saved weights only as tentative next starts, do not increase load without measured RIR, recalibrate after low reps/heavy notes. Raw wishes are included in the next plan notes for coach review. **Arbitrary free text is not automatically interpreted as an AI instruction or a safe exercise replacement.**
- If the saved wishlist or exercise comments report injury/pain red flags, no automatic workout is published. The completed session still saves; human/qualified review is required.
- Existing tester profiles must have an active `coach_memberships` row to see plans. Account ownership and RLS stay enforced.
- DB migrations applied on the live Forma Supabase project: `coach_feedback_autopublish`, `coach_autopublish_exact_pain_signals`, and `coach_wishes_capture_from_session_results`. Verify deployed triggers before moving between projects; don't assume GitHub alone deploys DB changes.
- Verification: the database rollback transaction tested next-plan creation, wish propagation and pain blocking with no test sessions left behind. The React test covering wish draft restoration is committed but CI/physical Android verification has not been run from this chat.


## Individual progression rules (15 October 2026)

For user accounts «Василий» and «Василия женщина» (Ксюша), the active server-side settings are stored in `private.coach_load_preferences`: `target_sets=3`, `use_rir=false`, `auto_progress=true`. Do not undo these on plan refreshes. Their personal settings are not defaults for all Forma members.

- Three working sets for **each** currently prescribed exercise. After a long break, stop earlier if technique, symptoms or recovery require it; do not grind through 24 sets at any cost.
- Do not require user-entered RIR; remove `targetRir` from these users' **new** plans. All sets are non-failure by default.
- Show a conspicuous `ДО ОТКАЗА` warning directly beside an exercise only when the plan deliberately contains `trainToFailure: true`. Automatic follow-up never assigns failure.
- After every completed coach workout, make measurable progress when performance was clean and no excessive heaviness/pain/technique issue was reported: if at the top of the prescribed rep range, suggest a small (about 2.5%) load increase; otherwise set the next target to one more repetition at the same weight. These are adjustable coaching heuristics, not universal science-based thresholds. The next load always remains a recommendation, not confirmation of achievement.
- For unknown/mismatched actuals, do not invent values. For comments indicating excessive heaviness, lost technique or too few repetitions, maintain/recalibrate loads without forced progression. Pain flags suppress automatic plan publication pending review.
- The current plan data for both people is published as new immutable records, not updated over an unfinished local draft. Current plan title contains «3 подхода». An already-started local draft intentionally keeps its original plan until the user completes it.
- The previous note that absence of RIR blocks weight increase is superseded **only for these two profiles**. Plans for other people must follow their own settings and consent.
- Backend SQL migrations applied: `coach_load_preferences_for_vasiliy_and_ksyusha`, `coach_auto_progress_without_rir_for_selected_users`; confirmed test transactions rolled back after checking weight progression, rep progression, high-exertion hold, and pain blocking. Frontend visible failure flag was added in `src/TrainerWorkout.jsx`; no Android APK was built or verified by this chat.

## Verification
`npm run build`
`node --test tests/gym-drafts.test.mjs tests/gym-ui.test.mjs tests/fatsecret.test.mjs tests/trainer-access.test.mjs`

UI lifecycle tests exercise real React components in JSDOM: input->unmount->restore, external template refresh, category switching, search, failed saving, double-click guard, and coach actual-vs-target separation. They simulate lifecycle destruction, not physical Android testing. Local Chromium rendering was unavailable in the runtime; do not claim a physical-device visual test. Preserve the existing integrations and current-main updates described in AGENTS.md.

## Compact coach screen preferences (13 October 2026)
Vasiliy records total work sets, average repetitions and working weight per exercise. Do not add compulsory per-set inputs or RIR recording. Prefill these numeric fields from the assignment while keeping target metadata separate; only Save confirms actual execution. Start repetitions use explicit startReps when provided, otherwise the lower bound of the prescribed range. General recommendations start collapsed, full technique/load notes remain accessible under Details, and personal comments open by icon. Keep coach training as its own app route with a Back button, not a dialog layered over manual exercises. Android visible version remains2.1; internal versionCode2101 allows the compact-screen update.

## Verified follow-up, 16 October 2026

`private.forma_autopublish_next_coach_plan` is active in production. Its current implementation is versioned in `supabase/coach-next-plan.sql`; do not replace it with an earlier unversioned snapshot. This follow-up repairs doubled backslashes in decimal-load matching, Russian pain word boundaries, and note newlines while preserving per-user `private.coach_load_preferences` (including three sets / no RIR where selected), existing progression, membership checks, immutable plans and source-session idempotency. A transaction-only validation in `supabase/coach-next-plan-validation.sql` checks 13.5 kg parsing, next-repetition instruction, exactly one next assignment, and no automatic new plan on pain; it rolls back sessions, ratings, feed and plans. Do not run the fixture as real training.

Galya's separate subscription runtime now has owner/lease-scoped `forma_trainer_request` and `forma_trainer_publish` operations, with private persistent request-to-plan IDs. It uses imported chief/gym specialist documents and current results/settings, not a live conversation with old ChatGPT agents. It can publish a new immutable plan only for Vasiliy after an explicit request; it does not overwrite existing drafts, plans or results. The Forma read bridge includes plans with null scheduled_date, since these are how automatic follow-ups are published. Assistant source and credentials remain separate from this public repository.
