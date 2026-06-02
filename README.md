# Amore Event Planner

Private mobile event planner page for creating Airtable events, publishing them to the rep portal, and assigning ambassadors by creating Booking records.

## Required Netlify environment variables

```text
AIRTABLE_TOKEN=your_airtable_personal_access_token
AIRTABLE_BASE_ID=appqulbpEb4AWfb75
AIRTABLE_BRANDS_TABLE=tblKvHgYsWiyyUlow
AIRTABLE_STORES_TABLE=tblQB27xwvKiVyLWW
AIRTABLE_EVENTS_TABLE=tblEpybLYG9dJmtEz
AIRTABLE_AMBASSADORS_TABLE=Ambassadors
AIRTABLE_BOOKINGS_TABLE=Bookings
PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_browser_key
```

`AIRTABLE_AMBASSADORS_TABLE` and `AIRTABLE_BOOKINGS_TABLE` can be table names or table IDs. Table IDs are better if you have them.

## Airtable fields expected

### Brands

- Brand Name

### Stores

- Store Name
- Address
- State
- Google Place ID
- Latitude
- Longitude

### Events

- Event Name
- Brand
- Store
- Event Date
- Start Time
- End Time
- Hourly Rate
- Status
- Portal Visible
- Details

### Ambassadors

- Name
- Email
- Phone Number
- Active

### Bookings

Required:

- Event
- Ambassador
- Scheduled Start Snapshot
- Scheduled End Snapshot

Recommended:

- Send Save the Date
- Created From Planner Page
- Assignment
- Ambassadors Email
- Booking Confirmed
- Save the Date Sent

## Publishing logic

Save as Draft:

- Status = Draft
- Portal Visible = unchecked

Publish to Rep Portal:

- Status = Scheduled
- Portal Visible = checked

## Assignment logic

Assign Ambassador:

- Loads future events
- Loads ambassadors
- Shows existing bookings for the selected event
- Prevents duplicate Event + Ambassador bookings
- Creates a Booking linked to the selected Event and Ambassador
- Sets Scheduled Start Snapshot and Scheduled End Snapshot when available
- Checks Send Save the Date when the field exists and the checkbox is selected
