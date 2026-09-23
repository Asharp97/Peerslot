# Launch readiness checklist

Use this checklist before opening PeerSlot to the public or spending on paid acquisition. Record the deployment URL, database branch, release identifier, reviewer, and date for each launch.

## Release candidate

- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes with no skipped release-critical tests.
- [ ] `pnpm build` succeeds with production environment variables.
- [ ] Dependency audit is reviewed and high or critical production issues have an owner and mitigation.
- [ ] The migration set has been applied to a preview branch and checked against a backup or restore procedure.
- [ ] Preview and production use separate Neon branches and separate object-storage credentials.

## Authentication and account safety

- [ ] New email sign-up, verification, sign-in, sign-out, Google sign-in, and disabled-signup behavior are tested in a real browser.
- [ ] Password reset, verification resend, expired links, and an account with no password are tested.
- [ ] A user with only attending appointments is not sent through provider onboarding.
- [ ] A provider can also attend another provider's appointment in the same account.
- [ ] Session expiry and token refresh recover without losing a booking draft.
- [ ] Account export contains all data visible to that account, including email-linked appointments.
- [ ] Account deletion removes or schedules removal of profile images, tokens, appointments, and dependent records according to the published policy.

## Booking lifecycle

- [ ] A public booking page shows enough available times to cover the intended booking horizon and does not silently hide later slots.
- [ ] Two people racing for one slot produce one confirmed reservation and one useful error.
- [ ] Pending, confirmed, declined, cancelled, completed, and expired states appear consistently in the client list, provider list, and calendar.
- [ ] Minimum notice is checked against the original appointment for rescheduling.
- [ ] The weekly client reschedule limit is enforced transactionally and resets in the provider's time zone.
- [ ] Cancellation and rescheduling notify every affected participant once, including failure and retry behavior.
- [ ] Recurring sessions and one-time exceptions are tested across daylight-saving changes and different time zones.
- [ ] Personal activities and availability blocks cannot be moved into the past or over an appointment without a clear error.

## Email and meeting integrations

- [ ] Resend domain, SPF, DKIM, DMARC, return path, reply address, bounce handling, and suppression handling are configured.
- [ ] Verification and appointment messages are tested in Gmail, Outlook, and at least one additional mailbox provider.
- [ ] Real message headers show aligned SPF, DKIM, and DMARC results.
- [ ] Google Meet API, OAuth consent screen, production callback URL, and test or verified users are configured. See [Google Meet setup](google-meet.md).
- [ ] A confirmed online appointment creates one valid Meet URL and the join action opens it in a new tab.
- [ ] Google connection failure leaves the appointment usable and gives the provider a retry path.

## Privacy, security, and operations

- [ ] Production secrets are stored in the hosting secret manager and are absent from logs, client bundles, and repository history.
- [ ] Rate limits use a shared store or the traffic limit is explicitly constrained to the current deployment model.
- [ ] Error monitoring captures route failures, rejected jobs, and notification failures without collecting tokens or private appointment notes.
- [ ] Structured logs include a request or appointment identifier, not full authorization headers or OAuth query strings.
- [ ] Database backups, retention, restore testing, and migration rollback ownership are documented.
- [ ] A support address and incident response owner are published.
- [ ] Terms, Privacy, Cookie Policy, and data deletion language identify the operating entity, jurisdiction, processors, and retention practice.
- [ ] If healthcare, education, or other regulated information is accepted, the applicable contractual and security review is complete. Do not imply regulatory compliance that has not been verified.

## Marketing and search

- [ ] Homepage copy describes providers and clients in plain language and matches the current product.
- [ ] Public policy pages, canonical metadata, language alternates, `robots.txt`, and `sitemap.xml` are reachable on the production domain.
- [ ] Only public marketing, policy, and published booking pages are indexable. Private workspaces remain excluded.
- [ ] Analytics, cookie consent, and retention are documented before adding non-essential tracking.
- [ ] The public booking link, verification link, support link, and email reply address all use the production HTTPS domain.
- [ ] A short support and cancellation policy is ready before paid campaigns begin.

## Controlled rollout

1. Run the full checklist against a fresh preview database.
2. Test with a small set of invited providers and clients using real email inboxes.
3. Review error and email delivery logs for at least one complete booking lifecycle.
4. Keep the first public release reversible. Record the release identifier and the person who can disable new bookings.
5. Review support requests and failed bookings daily during the first launch period.
