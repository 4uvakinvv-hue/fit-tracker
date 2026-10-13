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

## Verification
`npm run build`
`node --test tests/gym-drafts.test.mjs tests/gym-ui.test.mjs tests/fatsecret.test.mjs tests/trainer-access.test.mjs`

UI lifecycle tests exercise real React components in JSDOM: input->unmount->restore, external template refresh, category switching, search, failed saving, double-click guard, and coach actual-vs-target separation. They simulate lifecycle destruction, not physical Android testing. Local Chromium rendering was unavailable in the runtime; do not claim a physical-device visual test. Preserve the existing integrations and current-main updates described in AGENTS.md.

## Compact coach screen preferences (13 October 2026)
Vasiliy records total work sets, average repetitions and working weight per exercise. Do not add compulsory per-set inputs or RIR recording. Prefill these numeric fields from the assignment while keeping target metadata separate; only Save confirms actual execution. Start repetitions use explicit startReps when provided, otherwise the lower bound of the prescribed range. General recommendations start collapsed, full technique/load notes remain accessible under Details, and personal comments open by icon. Keep coach training as its own app route with a Back button, not a dialog layered over manual exercises. Android visible version remains2.1; internal versionCode2101 allows the compact-screen update.
