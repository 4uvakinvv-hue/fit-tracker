# Forma collaboration rules

- Start each task from the current GitHub `main` branch. Fetch the latest head before editing or publishing; do not publish a stale whole-file copy of `src/App.jsx` or `src/styles.css`.
- Keep task changes isolated. Inspect the worktree before editing and preserve unrelated/uncommitted work. Never reset or overwrite it.
- Before publication, check the remote head again. If it moved, rebase/reconcile changes and rerun relevant checks. Publish with an expected-head lease; never force overwrite another task's commits.
- Code, Edge Functions, and database schema are one integration. Preserve the FatSecret and trainer-access components, runtime functions, RLS, scheduled jobs, and secret names unless the user explicitly requests replacing them.
- Never publish credentials, service-role keys, OAuth tokens, or scheduler secrets. OAuth credentials stay server-side; browser clients use the authenticated functions.
- Run `npm run build` and relevant tests. For FatSecret/trainer changes run `node --test tests/fatsecret.test.mjs tests/trainer-access.test.mjs`.
- Check `TRAINER_SETUP.md` and `FATSECRET_SETUP.md` before altering these integrations. A web deployment does not redeploy Supabase functions or change database schedules.
- Keep `main` as the shared source of truth for work from multiple chats. A chat is not an independent deployment environment.

- Release versions use `major.minor` only. The next planned Forma release is `2.1`; do not publish it as `2.1.0`. Keep the same two-part version in app UI, Git tags, release names, APK/AAB filenames, and web package filenames.

- For gym/trainer UI changes also read GYM_TRAINER_SETUP.md. Preserve unfinished local drafts, never mix targets with actual results, and run gym-drafts/gym-ui lifecycle tests. Coach plans are server-published into coach_workout_plans, not completed sessions.
