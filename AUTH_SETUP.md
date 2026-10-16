# Forma 2.1 Auth setup

## Production URL configuration

Forma email confirmation and password recovery use Supabase Auth one-time links.

Required hosted Supabase settings:

- Authentication -> URL Configuration -> Site URL:
  `https://4uvakinvv-hue.github.io/fit-tracker/`
- Redirect URLs must include:
  `https://4uvakinvv-hue.github.io/fit-tracker/**`

If Forma is moved to a stable Sprinthost/custom HTTPS domain, add that exact domain to Redirect URLs and then change the client recovery redirect constant to that stable domain.

Do not leave Site URL as `http://localhost:3000` in production. Auth logs on 16 October 2026 showed valid recovery verification followed by a 303 redirect to localhost; the first click consumed the one-time token, so a second click reported an invalid/expired link.

## Registration UX

Email confirmation is required. After sign-up without a session, the app shows a dedicated "Проверьте почту" state, explains the three steps, and offers `supabase.auth.resend({type:'signup'})`.

Repeated signup or login with an unconfirmed email should lead back to the same confirmation state instead of leaving the user on an unchanged form.

## Password recovery

"Забыли пароль?" sends `resetPasswordForEmail` with the production redirect URL. The app handles the Supabase `PASSWORD_RECOVERY` auth event, lets the user enter a new password twice, then signs out and returns to login with a success notice.

Recovery links are one-time links. After a successful verify request, reusing the same email link is expected to fail.

## Session persistence

The Supabase client uses:

- `persistSession: true`
- `autoRefreshToken: true`
- `detectSessionInUrl: true`

On the same installed app/browser profile, a user should not need to enter credentials again unless they explicitly sign out, reinstall/clear app storage, or the stored session becomes unusable.

## Email delivery

The project currently uses Supabase's built-in sender (`noreply@mail.app.supabase.io`). Supabase documents this sender as best-effort and rate-limited. For reliable production email delivery, configure a custom SMTP provider in Authentication -> SMTP. Do not put SMTP credentials in the repository or browser client.

## Owner admin panel

The owner-only `admin-users` Edge Function validates the caller through Auth `/user`, then uses the service-role key only on the server. It can list:

- profile name
- registration email
- email confirmation state
- created time
- last sign-in time

It can hard-delete another user through the Supabase Auth Admin API. The owner account cannot delete itself. Never expose the service-role key in the client.
