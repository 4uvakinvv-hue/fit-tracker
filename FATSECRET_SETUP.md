# FatSecret integration

Owner pilot: Forma → О приложении → Питание · FatSecret.

1. Save OAuth 1.0 credentials as server-only Supabase secrets:
   `FATSECRET_CONSUMER_KEY`, `FATSECRET_CONSUMER_SECRET`.
2. Deploy `supabase/functions/fatsecret` with `verify_jwt=false`.
   Every state-changing endpoint validates the user's Bearer JWT through
   Supabase Auth and checks the pilot owner's ID. GET reports only configuration
   presence; it never returns a credential or calls the provider.
3. Apply `supabase/fatsecret-schema.sql` once. Tokens are encrypted with AES-GCM,
   bound to the user ID and accessible only to the server role. Rotating the
   consumer secret requires reconnecting the account.
4. Click «Подключить FatSecret», follow the official authorization link, and
   enter the provider's verification code in Forma (never in a chat).
5. Click «Загрузить последние 14 дней». This reads food/weight data, without
   modifying the source diary. The report marks diary completeness as unknown.

FatSecret user OAuth uses HMAC-SHA1 and the official out-of-band OAuth 1.0 flow.
Provider credentials may still require delegated access approval. A successful
unit test or deployment does not confirm approval or personal account access.

Reports are cached for 23h with hourly cleanup to stay within FatSecret's 24h
cache limit. Fresh reports can be read by the owner and the authorized main
trainer from `fatsecret_diary_cache`; expired reports are excluded by RLS.
Refresh requires a button press; no background diary polling is configured.
The owner's assistant may read a fresh report through the connected database;
this does not give unrelated chats direct access to FatSecret.

Allowed origins: GitHub Pages origin and Capacitor localhost schemes. Add an
explicit production web origin to `ORIGINS` if migrating hosting; don't use `*`.
Pilot is limited to user `633aadd5-14b9-470e-aa38-2ad4fb1dcf92`.
«Отключить от Forma» clears locally stored tokens and cached data; provider-side
authorization can also be revoked in FatSecret.

Validation: `node --test tests/fatsecret.test.mjs`, `npm run build`.
