# Steps source and freshness

Forma reads daily aggregate step counts through @capgo/capacitor-health / Android Health Connect, when the authenticated native app opens or resumes. It does not read the private StepsApp database or obtain phone-local steps through a server cron job. Browser clients display previously uploaded daily_steps.

An app showing steps does not prove that it writes them into Health Connect. When recent days are missing, first inspect Health Connect's Steps records and source applications on the actual phone. This inspection cannot be performed through the server database.

The history screen now offers a refresh, Health Connect settings, the last provider date and check time. Missing today is unknown, not zero. Stale responses are indicated even if the read and database upsert succeeded. Existing history is retained when a provider omits a day. Aggregates are already deduplicated by Health Connect; do not add overlapping source totals.

Reads request one year only when history access is authorized, otherwise the recent 30-calendar-day window. A synchronous ref prevents overlapping sync calls from initial load and native resume callbacks. Current diagnostics describe the current foreground check, not background monitoring.

Android changes require installing the newly built APK over the previous version. Keep the application ID/signing key and increase internal versionCode; visible version remains major.minor.

Run npm test and npm run build before publishing. Tests cover stale responses, true zero vs absent days, invalid samples and history-permission windows. Physical Health Connect and the StepsApp-to-Health-Connect path require a real device check.
