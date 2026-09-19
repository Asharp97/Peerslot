# Client rescheduling

Provider Settings includes **Client reschedules per week**, defaulting to **1** for new and existing booking pages. Providers can set 0–10; 0 disables client rescheduling.

The allowance applies to the authenticated client account across all appointments with that provider, including appointments assigned through the account's verified email. It resets Monday at 00:00 in the provider's booking-page time zone. The week is determined by when the change is submitted, not the original or replacement appointment date.

Only successful client reschedules count. Cancellations, failed requests and provider edits do not. Recurring exceptions share the same client/provider allowance. Existing notice, status, publication and availability rules still apply; minimum notice is checked against the current appointment, never the replacement slot.

Apply the schema migration before deploying this version:

```sh
pnpm db:migrate
```

Migration `0025_weekly_reschedule_limits.sql` adds the setting, a weekly usage table, and the database quota function. The quota check and appointment write share a Neon HTTP batch transaction so concurrent requests cannot overspend, and failed writes roll back usage. The agenda and slot lookup also check the allowance for immediate feedback.

Usage starts with this release. The old lifetime `appointments.rescheduleCount` cannot reliably distinguish client changes from provider changes or assign changes to calendar weeks, so it is not backfilled. Weekly usage is included in account exports and deleted with the client or provider account.
