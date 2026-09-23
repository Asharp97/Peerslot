# Google Meet connection setup

PeerSlot can create a Google Meet space for a confirmed online appointment. The provider connects one Google account from Account settings. PeerSlot stores an encrypted refresh token and uses it only to create Meet spaces for that provider's scheduled appointments.

This integration is optional. Booking, approval, and in-person appointments do not require Google Meet.

## 1. Create the Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Select an existing project or create a dedicated PeerSlot project.
3. Enable the **Google Meet REST API** for that project.
4. Configure the OAuth consent screen with the PeerSlot app name, support email, developer contact email, and the public privacy policy URL:
   `https://www.peerslot.com/en/policy/privacy`
5. Add the PeerSlot domain to the authorized domain list when the console requests it.

During development, keep the consent screen in testing mode and add every Google account that will test the connection under **Test users**. A Google account that is not an approved test user will receive `Error 403: access_denied` while the app is in testing mode. Before public use, complete the consent-screen publishing and verification steps Google requests for the selected scopes.

## 2. Create a web OAuth client

Create an OAuth client with application type **Web application**. Add the exact callback URL for every environment:

```text
https://www.peerslot.com/api/provider/google-meet/callback
http://localhost:3000/api/provider/google-meet/callback
```

The production URL must use the same origin configured in `BETTER_AUTH_URL`. Do not add a trailing slash, a locale prefix, a query string, or a frontend page URL. Preview deployments need their own callback URL and OAuth client if they are tested through Google.

Keep the client ID and secret private. Do not commit them or expose them in a `NEXT_PUBLIC_*` variable.

## 3. Configure the application

Set these variables in the environment where PeerSlot runs:

```dotenv
BETTER_AUTH_URL=https://www.peerslot.com
BETTER_AUTH_SECRET=<a-random-secret-at-least-32-characters>
GOOGLE_MEET_CLIENT_ID=<web-client-id>
GOOGLE_MEET_CLIENT_SECRET=<web-client-secret>
```

`GOOGLE_MEET_CLIENT_ID` and `GOOGLE_MEET_CLIENT_SECRET` are recommended so the Meet integration can use a dedicated OAuth client. If they are empty, PeerSlot falls back to `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Use the matching local values during development:

```dotenv
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_MEET_CLIENT_ID=<local-web-client-id>
GOOGLE_MEET_CLIENT_SECRET=<local-web-client-secret>
```

Restart the application after changing environment variables. The callback is generated from `BETTER_AUTH_URL`, so a stale deployment value causes a redirect URI mismatch.

## 4. Connect and verify a provider account

1. Sign in to a provider account with an active booking page.
2. Open **Account settings** and choose **Connect Google Meet**.
3. Select the Google account that should own the meeting spaces.
4. Review and accept the requested permissions.
5. Return to PeerSlot and confirm that the account email appears as connected.
6. Create or approve a future online appointment and verify that its **Join meeting** action opens a `meet.google.com` URL in a new tab.

PeerSlot attempts to prepare upcoming scheduled appointments after a successful connection. A later request can also create a missing space. Meeting creation is idempotent per appointment, so opening the appointment in two tabs does not intentionally create two spaces.

## Troubleshooting

### `redirect_uri_mismatch`

The callback registered in Google Cloud does not exactly match the runtime value. Check all of the following:

- `BETTER_AUTH_URL` uses the correct `https` production origin.
- The registered path is `/api/provider/google-meet/callback`.
- There is no locale prefix or trailing slash.
- The client ID in the environment belongs to the OAuth client where the callback was registered.
- The deployment was restarted after changing environment variables.

### `Error 403: access_denied` or “app is still being tested”

Add the Google account as a test user in the OAuth consent screen, or publish the app and complete Google's verification requirements before inviting accounts outside the test-user list. This error is controlled by Google and cannot be fixed by changing the PeerSlot button.

### `invalid_request` or the connection returns to Settings without connecting

Confirm that the client secret, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` are set in the same deployment. Check the server logs for the safe connection outcome. Never log the OAuth code, refresh token, or full callback URL with query parameters.

### `not_configured`, `not_connected`, or a missing meeting link

`not_configured` means the Meet client variables or required application URL are missing. `not_connected` means the provider has not completed the consent flow. A missing link on a pending, cancelled, declined, expired, or past appointment is expected. For a future confirmed appointment, reconnect the account and retry after checking that the Google account can create Meet spaces.

## Disconnecting and revoking access

Disconnecting in PeerSlot removes the encrypted refresh token from PeerSlot. To revoke the OAuth grant completely, open the connected Google account's [third-party connections page](https://myaccount.google.com/connections) and remove PeerSlot there as well. Reconnecting requires consent again.

## Production checklist

- [ ] Google Meet API is enabled in the production Cloud project.
- [ ] Production callback URL is registered on the production OAuth client.
- [ ] The consent screen has the production branding, privacy URL, and support contact.
- [ ] Every test account is approved while the app remains in testing mode.
- [ ] `BETTER_AUTH_URL` is the canonical HTTPS origin.
- [ ] Meet client secrets exist only in the production secret store.
- [ ] A real provider connection and a confirmed future appointment have been tested.
- [ ] Disconnecting and reconnecting have been tested.
- [ ] Google Cloud and application logs do not contain authorization codes or tokens.
