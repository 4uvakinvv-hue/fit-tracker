# FatSecret personal diary integration

OAuth 1.0 consumer key/secret reside in Supabase Edge Function Secrets (`FATSECRET_CONSUMER_KEY`, `FATSECRET_CONSUMER_SECRET`). AES-GCM encrypts stored member access tokens, bound to Forma user ID. Changing consumer secret requires reconnection. Credentials and tokens are never shipped to the browser.

Open “Заказать тренера” from Home/Gym -> active access -> FatSecret. Authorize the user's existing diary account using the official three-legged OAuth page. Enter the PIN only in Forma. The scheduled server refresh reads 14 days of calorie/macronutrient totals and weight every 6 hours, with hourly retry checks. “Обновить сейчас” is an optional manual refresh. Opening the panel reads the fresh cache and shows the last successful sync and sanitized last error.

Empty diary entries or missing nutrients are unknown, never assumed zero. Completeness of logging remains unconfirmed until discussed with the user. Tokens may be retained for the authorized connection; summary cache expires after 23 hours and hourly cleanup ensures at most 24 hours. Disconnect removes local connection and cached report; provider revocation is managed by the user in FatSecret.

See TRAINER_SETUP.md for scheduler, entitlement checks, deployment and limitations. No OpenAI API key is required for syncing diaries; the main trainer reads authorized, fresh reports through the existing database connector during conversation.
