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

## Multiple chats
Always start from current main and respect AGENTS.md. Main commit history is shared; database settings live in Supabase and do not vanish with ordinary web updates. Deploying stale files or changing schema/functions can break integration, so never replace these with an old snapshot.
