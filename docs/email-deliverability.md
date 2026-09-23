# PeerSlot email delivery setup

Templates alone cannot guarantee inbox placement. Mailbox providers also evaluate domain authentication, sending reputation, recipient complaints, and the links in a message. The changes in this repository improve the content and sending configuration; the account and DNS steps below still need an owner to complete them.

## Findings from 11 September 2026

| Check                      | Observed result                                       | Meaning                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sender                     | `notifications@peerslot.com`                          | Previously hardcoded in every notification, ignoring `EMAIL_FROM`. The sender is now configurable, with the existing address retained as its default.          |
| DKIM                       | TXT record exists at `resend._domainkey.peerslot.com` | A public key is present. Only a received message or the Resend dashboard can confirm that outgoing messages use it and pass verification.                      |
| DMARC                      | No TXT record at `_dmarc.peerslot.com`                | Add the DMARC policy below.                                                                                                                                    |
| Default Resend Return-Path | No TXT or MX record at `send.peerslot.com`            | Check Resend for the actual Return-Path. A custom subdomain may be in use; do not guess its name or regional MX target.                                        |
| Root SPF/MX                | Cloudflare Email Routing records exist                | Preserve the working root records. Resend's sending records normally belong on its Return-Path subdomain.                                                      |
| Resend access              | API returns `restricted_api_key` for domain reads     | The configured key can send emails, but cannot inspect domain verification, tracking settings, or delivery history. Keep this limited key for the application. |
| Local app URL              | `http://localhost:3000`                               | This was the local development configuration, not a verified production setting. Production must use the public HTTPS address.                                 |
| Reply address              | No local `EMAIL_REPLY_TO` configured                  | Set a mailbox or forwarding alias you actually monitor.                                                                                                        |

No emails were sent, and no DNS or Resend account settings were changed during this review.

## 1. Verify the sending domain in Resend and Cloudflare

Open **Resend → Domains → peerslot.com**. Ensure sending is enabled and every required sending record is verified. Copy its **exact DKIM TXT, SPF TXT, and Return-Path MX records** into Cloudflare DNS. The MX target depends on Resend's region, so use the dashboard value.

If the dashboard uses the default Return-Path, its SPF TXT and MX records belong at `send.peerslot.com` (enter `send` as the Cloudflare name). If it uses a custom Return-Path, use that name instead. Preserve Cloudflare Email Routing's root MX and SPF records; do not add a second SPF policy at the same DNS name or replace incoming-mail MX records with a sending-service Return-Path record.

Reference: [Resend's Cloudflare setup](https://resend.com/docs/knowledge-base/cloudflare).

## 2. Publish DMARC

In **Cloudflare → peerslot.com → DNS → Add record**, start with:

| Field   | Value               |
| ------- | ------------------- |
| Type    | `TXT`               |
| Name    | `_dmarc`            |
| Content | `v=DMARC1; p=none;` |
| TTL     | Auto                |

For aggregate reports, first create a working mailbox/forwarding alias or DMARC-reporting service, then add its address, for example `rua=mailto:dmarc@peerslot.com;`. That example address must exist before using it.

Start with monitoring (`p=none`). After verifying every legitimate sending service passes aligned SPF or DKIM, review the reports and move to `p=quarantine` and eventually `p=reject`. Enforcing a strict policy before authentication works can reject legitimate messages; it does not force inbox placement.

Reference: [Resend's DMARC setup and rollout](https://resend.com/docs/dashboard/domains/dmarc).

## 3. Turn off tracking for these transactional emails

In the Resend sending-domain settings, turn **Open Tracking** and **Click Tracking** off for the domain used by signup and appointment emails. This keeps verification links direct and avoids adding an open-tracking pixel. The application's send-only key cannot inspect or change these domain settings.

If marketing emails are added later, keep their sending preferences and tracking separate. Verification and appointment messages should remain focused on the account action or appointment; do not add promotional content or a nonfunctional unsubscribe link to them.

References: [Resend domain features](https://resend.com/docs/dashboard/domains/introduction), [Gmail inbox-placement guidance](https://resend.com/docs/knowledge-base/how-do-i-avoid-gmails-spam-folder).

## 4. Confirm production environment settings and deploy

Set these in the production hosting environment, then deploy the repository changes:

```dotenv
BETTER_AUTH_URL=https://www.peerslot.com
NEXT_PUBLIC_SITE_URL=https://www.peerslot.com
EMAIL_FROM=PeerSlot <notifications@peerslot.com>
EMAIL_REPLY_TO=your-working-support-address
```

Use the actual monitored email address for `EMAIL_REPLY_TO`, not the placeholder. Cloudflare Email Routing can forward an alias to your inbox, but verify the alias and its destination first. Keep the existing production `RESEND_API_KEY`; never paste the key into a template or commit it. Use the same canonical HTTPS site address for auth and public links. Keep localhost in development only.

The application now rejects localhost, credential-bearing, and unsafe action URLs in production instead of emailing unusable verification links. Normal local development links continue to work.

## 5. Validate a real signup after deployment

Use your own test inboxes to create a fresh account. Open the received verification email's **Show original / View message source** and confirm:

- `From` uses your verified PeerSlot domain.
- `Authentication-Results` reports `spf=pass`, `dkim=pass`, and `dmarc=pass`.
- The DKIM signing domain or authenticated SPF domain aligns with `peerslot.com`.
- The verification button and visible fallback URL use your real HTTPS auth domain and are not rewritten through a tracking service.
- The verification link works and expires after the configured hour.

Check Resend's delivery logs for bounces, complaints, suppressions, and deferrals. **Delivered means the receiving server accepted the message; it does not prove inbox placement.** Do not remove suppression entries just to force delivery to recipients who complained or hard-bounced. Monitor [Google Postmaster Tools](https://postmaster.google.com/) when enough Gmail traffic is available for reports.

If a fresh message still lands in junk, share its redacted `Authentication-Results`, `From`, `Return-Path`, `DKIM-Signature` domain/selector, and any provider diagnostic headers, plus the receiving email provider. Remove recipient addresses and verification tokens. These headers and Resend domain/dashboard access are the missing evidence needed to distinguish authentication problems from reputation or recipient filtering.

Reference: [Google's email sender guidelines](https://support.google.com/mail/answer/81126?hl=en).

## Repository changes

- Clear English and Turkish verification content identifying the account, the one-hour expiry, how to request another link, and what to do if the recipient did not request it.
- Simpler branded HTML with UTF-8 metadata, the correct language, a direct action button, and a visible fallback URL; matching plain-text bodies remain included.
- Fixed, descriptive appointment subjects. Free-form client notes are read in the authenticated dashboard instead of copying arbitrary links or promotional text into notifications.
- Confirmed appointments link to the client's account; declined-request copy no longer promises that a homepage link opens a specific provider's available slots.
- `EMAIL_FROM` and `EMAIL_REPLY_TO` are respected by all notifications. Automatically generated mail is identified with `Auto-Submitted`; this header is not an inbox-placement guarantee.
- Regression tests cover local/production URLs, escaping, both locales and body formats, sender configuration, and verification content.
