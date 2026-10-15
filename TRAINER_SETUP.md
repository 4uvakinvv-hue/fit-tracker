# Forma trainer pilot

The web app opens `TrainerModal` from “Заказать тренера” on Home and Gym. FatSecret is inside the active trainer panel, not About. The owner sees all trainer requests, and can grant or extend 30/90-day free trial access or revoke it. Existing trainer-request triggers notify the owner's in-app bell. No email, Telegram, card billing, automatic payment verification, or in-app AI response is implemented. Recommendations currently stay in the authorized main-trainer ChatGPT conversation.

## Server
- `trainer-access`: validates JWT using Auth `/user`, derives caller identity server-side, and permits admin actions only for the fixed owner UUID. `coach_action` is callable only by service_role. All membership and notice writes stay server-side; RLS denies client access.
- `fatsecret`: validates human JWTs and active membership, or accepts origin-free scheduler requests after `claim_fatsecret_sync` checks the Vault secret and obtains a timed claim. Never use a user-supplied user ID for human calls.
- `save_fatsecret_snapshot`: locks current connection, verifies ciphertext and active access, then saves the expiring report and timestamp atomically. Disconnect/reconnect or access expiry cannot publish a report from an obsolete connection.
- `forma-fatsecret-auto-sync`: checks due connections hourly at minute 15 UTC, synchronizes when the last successful report is at least 6 hours old. Failed jobs retry on the next hourly check, with a 30-minute attempt lease. At most 10 users per scheduler pass in the pilot. Approx. 16 provider calls per refresh. No persistent food-item data; summaries expire after 23 hours and are cleaned hourly.
- `forma-coach-access-lifecycle`: hourly at minute 5 UTC. Sends an in-app notice once within 3 days of expiry; expires memberships and inserts a notice. Endpoints enforce the exact timestamp without waiting for cron. Notices appear in the trainer window, not push/email.
- Owner has ongoing test access; non-owner grants have explicit end dates. Revoked/expired access stops automatic diary reads; disconnect remains authorized for the data owner.

## Deployment
Apply `supabase/trainer-access.sql` (idempotent) with an authorized database administrator. Deploy `fatsecret` (index.ts/handler.js/oauth.js) and `trainer-access` (index.ts/handler.js). Both use custom Auth validation, so gateway JWT verification is disabled intentionally. Scheduler secret is generated directly into Vault and must never be printed or copied into the client. Existing FatSecret consumer secrets are unchanged.

Verify live scheduler through `net._http_response` using only status and sanitized result. Verify timestamps in `fatsecret_connections`/`fatsecret_diary_cache`; do not select ciphertext or Vault decrypted values. Test request -> owner approval -> active -> expiry, including cross-user denial. Finish with production bundle/deployment verification.

## Payments later
Add provider checkout and signature-verified, idempotent webhook events with merchant, currency, amount and order/user matching. A redirect or client flag is never proof of payment. Verified payment events extend a server-side entitlement transactionally. Until a provider and tariffs are approved, only manual free trials exist; no card form or dummy “paid” state.

## Coach subscription pilot and first-time onboarding (15 October 2026)

- Current pilot remains **free**. Trial entitlements use `coach_memberships`; the server-side `trainer-access` endpoint checks `status='active'` and `access_until`, and the client rechecks on focus. Paying through Telegram, Stripe, YooKassa, any link, or a bot is **not** implemented. Never show a successful payment or grant an entitlement from an unverified redirect, chat message, or client-side flag.
- Display planned pricing, **not checkout**: 1 month = 1,000 RUB; 6 months = 5,000 RUB (saving 1,000); 12 months = 10,000 RUB (saving 2,000). Store prices on the server and validate provider-signed webhook payment data before activating any paid subscriptions. Define whether a calendar month or 30-day period is the product rule before billing.
- Remove ordering from Home. In Gym, show a prominent first-screen «Тренировка от тренера» control and a bottom «Заказать тренера» control. A nonmember sees the subscribe/ordering explanation; manual Gym remains free and accessible even after coaching expires. CrossFit has a **disabled-in-function**, clickable preview that says «Пока эта функция в разработке».
- Existing authorized members with published `coach_workout_plans` continue immediately without re-enrollment. An authorized new member with no plan sees a short one-time intake in `src/TrainerWorkout.jsx`. Collected fields: age, optional sex, experience, goal, weekly training frequency, limitations (yes/no) and free wishes. Input goes to `coach_intakes` under per-user RLS.
- The `private.forma_coach_intake_initial_plan` trigger generates a conservative first plan, with **unknown rather than fabricated** starting weights, from the selected goal. If limitations are reported, intake status becomes `review` and no plan is generated until suitable review. A returned member with an existing plan is never overwritten by intake.
- Subsequent completed coaching sessions keep their history and trigger a fresh server-authored plan; do not assume the server is calling a paid LLM. It applies conservative rules for load/rep progression. Free-form wishes are carried into the next plan but **not semantically interpreted** as a full AI-coach decision. Human/ChatGPT coaching remains the route for complex changes during pilot testing.
- Supabase migration applied: `coach_intake_secure_first_workout`. Check per-user authorization and entitlement in both HTTP functions and DB RLS, never trust a client-supplied account ID alone. Access to `coach_intakes` is own-record SELECT and active-own INSERT only. No payment credentials or patient data may be logged.
- Database checks on 15 October used rolled-back transactions: valid intake creates exactly one first plan with null working weights, intake with limitations sends to review, another user's intake insert is rejected, and inactive members cannot create an intake. These do **not** replace a real browser/Android test or `npm run build`.
- Future product: CrossFit coach training, using a separate workout/program ontology and individual load/volume history; **no generation or paid access is active** for CrossFit yet.

## Payment activation design (not implemented yet)

When a provider is selected: create a server-side purchase order bound to an authenticated `user_id`, immutable tariff price/currency/duration and provider order ID. Only a cryptographically verified provider notification can set an idempotent `paid` event and extend `coach_memberships.access_until`; optionally connect a Telegram bot with one-time deep link identifying an order rather than trusting the user's Telegram display name. Expiry checks must be server-side on every coach-plan read/write. Trial access remains an explicit administrative action while testing.

## Multiple chats
Always start from current main and respect AGENTS.md. Main commit history is shared; database settings live in Supabase and do not vanish with ordinary web updates. Deploying stale files or changing schema/functions can break integration, so never replace these with an old snapshot.

## Gym coach mode (2.1)
See GYM_TRAINER_SETUP.md for persistent drafts, exercise search, the coach_workout_plans schema, actual-result saving and publishing the next assignment. Recommendations now have a dedicated workout window, while free-form AI conversation remains in ChatGPT.
