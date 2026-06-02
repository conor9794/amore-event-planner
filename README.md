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
