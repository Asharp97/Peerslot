# Testing the PeerSlot API

[Bruno](https://www.usebruno.com/) works well with PeerSlot. The Next.js route
handlers are ordinary HTTP endpoints, and Neon is an implementation detail
behind them. Bruno never connects directly to Neon and never needs the database
connection string.

## Start the application

```bash
pnpm dev
```

The API is available at `http://localhost:3000`.

## Use the included Bruno collection

1. Open Bruno.
2. Choose **Open Collection**.
3. Select the repository's `bruno` directory.
4. Select the `local` environment.
5. Run the collection. Bruno orders the topic folders and their numbered
   requests using the checked-in `folder.bru` metadata.

The collection captures Better Auth's signed session token from the
`set-auth-token` response header. It exchanges that session for a short-lived
JWT, then sends the JWT as `Authorization: Bearer ...` to PeerSlot application
routes. Runtime variables keep both credentials in memory only.

Requests are divided into `health`, `auth`, `provider`, `booking-pages`,
`availability-windows`, `available-times`, and `slots`. Run the full collection
to test sign-up, sign-in, JWT issuance, JWKS, refresh and session revocation,
provider onboarding, booking-page publication and link regeneration,
availability-window lifecycle rules, server-side available-time calculation,
public lookup, and protected slot routes. Every request includes Bruno tests,
and response scripts supply runtime variables to later folders.

The Auth folder revokes the session after minting the access JWT. The later
folders intentionally continue with that short-lived JWT, while the Auth tests
prove the revoked session can no longer mint another token.

The POST requests send `Origin: {{baseUrl}}`. Better Auth validates this header
against `trustedOrigins` when Bruno's cookie jar includes a session cookie. If
you change `baseUrl`, update `BETTER_AUTH_URL` to the same origin and restart
the development server.

Change `testEmail` in `bruno/environments/local.bru` when you want a new user.
Better Auth will reject a duplicate signup, but the existing account can still
sign in.

## Complete provider onboarding

The Provider folder creates the provider profile and its booking page. It uses
Ceyda as the display name, Europe/Istanbul as the time zone, and a 10-minute
default rest period. The response stores the generated eight-character slug in
Bruno's `bookingSlug` runtime variable.

The Booking pages folder verifies owner settings, public visibility,
publish/unpublish behavior, immediate invalidation of a compromised link,
resolution of the regenerated link, and rejection of a booking slug used as an
authentication token.

The Availability windows folder creates a three-hour free-time window and
checks that it derives five 30-minute appointment times separated by the
configured 10-minute rest period. It also covers UTC and provider-time-zone
representations, past and overlapping-window rejection, editing and slot
regeneration, disabling/re-enabling, and safe removal.

The Available times folder creates an isolated calculation fixture and checks
the public date-range endpoint for ordered results plus English and Turkish
labels. It also checks invalid-range rejection and removes its fixture.

In the browser, the same flow lives at `/en/auth/provider` and
`/tr/auth/provider`. Email/password and Google authentication both
continue into the same provider setup form and dashboard.

## Endpoints

| Method   | Path                                    | Authentication        | Purpose                                |
| -------- | --------------------------------------- | --------------------- | -------------------------------------- |
| `GET`    | `/api/health`                           | No                    | Verify the application can query Neon  |
| `POST`   | `/api/auth/sign-up/email`               | No                    | Create an email/password account       |
| `POST`   | `/api/auth/sign-in/email`               | No                    | Create a revocable Better Auth session |
| `GET`    | `/api/auth/get-session`                 | Session Bearer/cookie | Inspect the session and receive a JWT  |
| `GET`    | `/api/auth/token`                       | Session Bearer/cookie | Mint a 15-minute JWT                   |
| `GET`    | `/api/auth/jwks`                        | No                    | Publish public JWT verification keys   |
| `POST`   | `/api/auth/refresh`                     | Session Bearer/cookie | Mint a replacement 15-minute JWT       |
| `POST`   | `/api/auth/sign-out`                    | Session Bearer/cookie | Revoke the current session             |
| `POST`   | `/api/auth/sign-in/social`              | No                    | Start Google OAuth                     |
| `GET`    | `/api/me`                               | JWT                   | Read user and PeerSlot capabilities    |
| `GET`    | `/api/provider`                         | JWT                   | Read provider onboarding status        |
| `POST`   | `/api/provider`                         | JWT                   | Create/update profile and booking page |
| `GET`    | `/api/provider/dashboard`               | Provider JWT          | Read provider workspace summary        |
| `GET`    | `/api/booking-page`                     | Provider JWT          | Read the provider's booking page       |
| `PATCH`  | `/api/booking-page`                     | Provider JWT          | Update settings or publication state   |
| `POST`   | `/api/booking-page/regenerate-link`     | Provider JWT          | Replace a compromised public slug      |
| `GET`    | `/api/booking-pages/:slug`              | No                    | Read a published booking page          |
| `GET`    | `/api/availability-windows`             | Provider JWT          | List provider availability windows     |
| `POST`   | `/api/availability-windows`             | Provider JWT          | Create a window and derive slots       |
| `PATCH`  | `/api/availability-windows/:id`         | Provider JWT          | Edit, disable, or re-enable a window   |
| `DELETE` | `/api/availability-windows/:id`         | Provider JWT          | Remove or preserve a future window     |
| `GET`    | `/api/booking-pages/:slug/availability` | No                    | Calculate available times in a range   |
| `GET`    | `/api/slots`                            | JWT                   | List future slots for the current user |

## Availability lifecycle

- API inputs must be ISO 8601 timestamps containing `Z` or an explicit UTC
  offset. PostgreSQL stores them as `timestamptz`; responses also include
  `localStartsAt`, `localEndsAt`, and the booking page's IANA time zone.
- A window must start in the future, end after it starts, and fit at least one
  configured appointment. Active windows on the same booking page cannot
  overlap.
- PeerSlot derives appointment times from the booking page's appointment
  duration and booking interval. The interval equals the duration plus the
  provider's configured rest period, which prevents generated times from
  overlapping. Providers no longer create slots manually.
- The public calculation endpoint requires offset-aware `startsAt` and `endsAt`
  query parameters. It returns ordered UTC instants and `localized.en` plus
  `localized.tr` labels in the provider's configured time zone.
- Minimum notice and scheduled appointments remove candidate times. Cancelled
  appointments do not block their former times, and inactive windows are not
  loaded.
- Disabling a window removes unbooked derived slots. Removing a future window
  deletes it only when it has no appointments; otherwise the window is disabled
  and retained with its booked slots.

## Token lifecycle

- The Better Auth session token is the revocable credential used only for
  session inspection, JWT issuance, refresh, and sign-out.
- PeerSlot application routes accept only asymmetric JWT access tokens. They
  validate signature, issuer, audience, and expiration.
- A booking-page slug only locates public page data. It cannot authenticate a
  student, provider, or API request.
- JWTs expire after 15 minutes. `POST /api/auth/refresh` requires an active
  Better Auth session and returns `{ token, tokenType, expiresIn }`.
- Signing out revokes the session, preventing further JWT refreshes.
- Signing keys rotate every 30 days with a one-day verification grace period;
  private keys remain encrypted in the database.

## OAuth testing

Add the Google credentials to `.env.local`, then restart the development
server. Configure this local redirect URL in Google:

- Google: `http://localhost:3000/api/auth/callback/google`

The Bruno social-login request returns an authorization URL when
`disableRedirect` is enabled. Open that URL in a browser to complete the OAuth
flow. Browser testing is more convenient than Bruno for the redirect and
consent portion, while Bruno remains useful for inspecting the initial response
and testing Bearer-authenticated API routes.

## Useful status codes

- `200`: request succeeded
- `201`: provider or slot created
- `400`: malformed input
- `401`: missing, invalid, expired, or revoked authentication
- `403`: signed in, but missing provider capability
- `409`: availability overlaps or a booked window cannot be time-edited
- `503`: the application could not reach Neon
