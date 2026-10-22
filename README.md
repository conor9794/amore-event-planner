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

## Event Planner — Manage Regions (draft feature)

Operators can open **Manage Regions** from the planner, enter a region name and state, and save. New records go to the existing Airtable Operating Regions table as Approved, then appear in the Add Event area dropdown. This does not assign ambassadors or modify existing bookings.

**Write security:** Set a strong `REGION_ADMIN_PASSWORD` Netlify environment variable scoped to **Functions**. Keep it marked secret and never include it in source control or client files. The route `/api/region-admin` rejects POST writes when this variable is missing or less than 24 characters. Share the password with authorized managers through an appropriate secure channel. The password is held in the browser only while the page is open, never stored in localStorage.

**Acceptance checks before merging:** Confirm the preview's Manage Regions page opens; save a unique test region using the management password; verify it appears in the Add Event area dropdown and Operating Regions table; verify duplicate and incorrect-password errors; and review the operator's access. Delete the temporary test region afterward. Check the Wisconsin draft workflow separately, and do not publish or merge without approval.
