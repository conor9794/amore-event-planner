# Amore Event Planner

Mobile-friendly event planner for creating Airtable Events and creating Bookings from a second Assign Ambassador page.

## Netlify environment variables

Required:

- `AIRTABLE_TOKEN`
- `AIRTABLE_BASE_ID`
- `PUBLIC_GOOGLE_MAPS_API_KEY`

Recommended table variables:

- `AIRTABLE_BRANDS_TABLE`
- `AIRTABLE_STORES_TABLE`
- `AIRTABLE_EVENTS_TABLE`
- `AIRTABLE_AMBASSADORS_TABLE`
- `AIRTABLE_BOOKINGS_TABLE`
- `AIRTABLE_INTEREST_TABLE`

`AIRTABLE_INTEREST_TABLE` should point to the Event Interest / Availability table if the exact table name differs.


## Fix included

Ambassador search now loads all Ambassador records instead of capping at 500 records, so active ambassadors later in the table/alphabet should appear in search.


Update: Assign Ambassador now has searchable event selection with mobile-friendly result cards.

## Planner access controls (draft, not live)

The Event Planner has three independent operator accounts only: conor9794@gmail.com, melinda@amorestaffing.com, and tommaguire2323@gmail.com. No self-registration. A secure eight-hour HttpOnly cookie is issued after email/password login. The session carries the approved email, expiry, and HMAC signature, and is validated at the Netlify Edge before serving the planner UI or /api endpoints.

Set these TWO Netlify site environment variables, with **Functions** scope and **all** deploy contexts (including deploy previews), marked as secrets, and redeploy:
- `PLANNER_AUTH_USERS`: a JSON object keyed by those three approved emails; each value has a randomly generated 16-byte hex salt and a 32-byte scrypt hash (N=16384, r=8, p=1) of that user's temporary password. No plaintext passwords in code or Netlify env vars.
- `PLANNER_SESSION_SECRET`: independent cryptographically random secret of at least 48 characters; used solely to sign operator sessions.

**Do not put the passwords, hashes, or session secret in this repository.** The application fails closed without the configured variables. After assigning credentials privately, validate login and logout for each operator plus a denied fourth email; check unauthorized /api/ and /.netlify/functions/ endpoints and /index.html return no records; check legacy signed webhook relays independently.

## Manage Regions (draft)

The Event Planner provides a **Manage Regions** tab under the same operator login (NO second password). New operating regions are written to Airtable Operating Regions with Approved status and appear in the Add Event area dropdown. Invalid states and duplicate region names are rejected. No existing events or bookings are changed when a region is added.

Before merging: test with a genuine new region, verify records in Airtable and event dropdown, test a Wisconsin draft's Central-time start/end, and regression-check bookings, rep access, recaps, payroll, and webhook integrations. Protect all entry points first. Do not merge or publish before approval.

## Operator password self-service (draft)

- An approved operator signs in with their temporary password, opens **Change Password** in the planner, enters the current password and a private new password (14–128 characters), and signs in again. After the change, the old temporary password is no longer accepted for that operator.
- New password hashes and salts are saved in a strong-consistency, site-wide Netlify Blobs store (`amore-planner-operator-credentials-v1`). The existing Netlify `PLANNER_AUTH_USERS` values remain initial bootstrap credentials **only until that operator has saved a new password**. No new plaintext passwords are written to source code or Netlify environment variables. Because the store is site-wide, do not test with throwaway credentials on real operators.
- Password changes require an existing signed-in session **and** the current password; the response clears the current browser's session.
- The **Forgot Password** link opens `/reset-password.html`. A reset request returns the same generic message for unknown and approved accounts; approved accounts receive a 15-minute single-use link via Resend. Tokens are saved as SHA-256 digests in a separate strong-consistency store (`amore-planner-operator-reset-v1`). There is a 90-second per-account send cooldown. The reset link itself never contains the new password.
- Email recovery is intentionally disabled (503 with a clear message) until email sending is configured. Set `RESEND_API_KEY` (secret) and `PLANNER_RESET_FROM_EMAIL` (a verified sender identity, e.g. `Amore Staffing <no-reply@verified-domain.example>`) in Netlify with **Functions** access and required deploy contexts, then redeploy and test mail delivery using an authorized operator account.
- The password login and recovery logic permit exactly the three listed operators; there is no public registration.
- Current sessions from other devices remain valid until their pre-existing eight-hour expiry. Treat session revocation across devices and request-level login throttling as pre-production security checks.
- Manual acceptance: authorized login, incorrect current password, successful password change and old-password denial, logout, third-party access rejection, email request and delivered link, one-use reset, reset expiry, and access to existing operations. Do not merge before those pass.

**Production remains unchanged until the draft PR is reviewed and merged.**
