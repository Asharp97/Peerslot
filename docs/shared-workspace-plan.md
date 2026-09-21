# One PeerSlot workspace

Use one account, one navigation system, and one shared appointment list. Hosting
and attending are roles on an appointment. They are not separate account modes.

## Navigation and routes

Use a Next.js `(workspace)` route group for the shared authenticated layout. The
group does not appear in URLs. Keep the locale prefix on every page.

| Menu item | Proposed path | Who sees it |
| --- | --- | --- |
| Overview | `/dashboard` | Everyone |
| My appointments | `/my-appointments` | Everyone |
| Calendar | `/calendar` | Everyone |
| Requests | `/requests` | People who have enabled hosting |
| Clients | `/clients` | People who have enabled hosting |
| Personal activities | `/personal-activities` | Everyone, once scheduling is independent of a booking page |
| Settings | `/settings` | Everyone |

Build the menu from one configuration with capability conditions. A person who
only books appointments sees the same layout with fewer tools. Keep the common
items in the same order. Offer one optional action: "Accept bookings".

## Page behavior

- My appointments is the shared chronological card view. Keep Hosting and
  Attending as secondary information under the participant name. Status retains
  its own badge. Use role-specific actions and the existing scheduling rules.
- Calendar is the visual time view. Attending appointments are visible to their
  authenticated participant. Hosting adds availability management and scheduling
  tools. Dragging must never grant permission to edit somebody else's booking.
- Overview shows the next appointments for everyone. Booking-page controls and
  incoming requests appear only when hosting is enabled.
- Settings contains personal details, locale, time zone, and account controls.
  Booking rules and Google Meet connection appear for hosts.
- Clients means the contacts whose appointments someone manages. Attendees means
  participants in a specific appointment. Use Clients for the directory.

## Implementation sequence

1. Land the current naming changes: `/my-appointments`, `/provider/calendar`,
   `/provider/clients`, `calendar` and `clients` translation keys, menu order, and
   redirects from the previous paths.
2. Extract authentication and identity into `WorkspaceShell`. The current
   `ProviderShell` requires a provider profile and booking page, so it cannot be
   the shared guard unchanged. Keep provider setup optional in the shared state.
3. Move pages under the shared route group. Redirect existing `/provider/...`
   URLs to the corresponding neutral paths. Redirect sign-in to the common
   dashboard without forcing clients into provider onboarding.
4. Split calendar read access from hosting controls. Reuse the existing attendee
   query and host services. Move personal scheduling settings off the required
   booking page before enabling personal activities for every account.
5. Make the card view sufficient for hosts who prefer it. Reuse the existing
   request-review and appointment editor logic from cards, including recurring
   occurrence scope, instead of requiring a visit to Calendar for each change.

Navigation visibility is not authorization. Preserve API ownership checks for
hosting and attending independently. Rename provider-specific backend services
only when their responsibility becomes shared; avoid unrelated database renames.

## Acceptance checks

- An attendee without a provider profile reaches My appointments and the shared
  dashboard without being asked to configure a booking page.
- A host can attend another professional's appointment with the same account and
  see both roles without switching workspaces.
- Hosting tools appear after setup; direct URLs and APIs still enforce access.
- List and calendar display consistent occurrences, status, and meeting details.
- Existing notice periods, weekly reschedule limits, and cancellation rules are
  enforced identically from every view.
- Legacy links, authentication callbacks, and notification links retain locale.
- Both supported languages, mobile navigation, empty states, and load failures
  work for attendees and hosts.
