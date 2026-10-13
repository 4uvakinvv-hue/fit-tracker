# Display-name changes

All authenticated members can change their own profile name from About -> My name. The server permits one actual change every 24 hours. Saving the same normalized name is a no-op; it does not consume another change. Existing users have no initial cooldown.

Deploy supabase/profile-name.sql before publishing the UI. The public RPC change_profile_name(p_name) is an invoker wrapper around a private, authenticated-user-only helper. The helper obtains identity from auth.uid(), locks only that profile row, validates 1–60 characters, and updates only name/name_changed_at/updated_at. Direct browser UPDATE on profiles remains unavailable. Anonymous execution is revoked. Concurrent requests serialize at the row lock, so another tab cannot bypass the cooldown. Server clock determines eligibility; client clock is informational only.

Verified on the deployed database in a rolled-back transaction: first change, second-change rejection, same-name no-op, invalid empty/overlong names, missing authentication, anonymous execution privilege, unchanged points. No real name was changed by verification. npm test and npm run build pass.
