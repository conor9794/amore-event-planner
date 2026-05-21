# Amore Event Planner

Private mobile event planner page for creating Airtable events and optionally publishing them to the rep portal.

## Required Netlify environment variables

```text
AIRTABLE_TOKEN=your_airtable_personal_access_token
AIRTABLE_BASE_ID=appqulbpEb4AWfb75
AIRTABLE_BRANDS_TABLE=tblKvHgYsWiyyUlow
AIRTABLE_STORES_TABLE=tblQB27xwvKiVyLWW
AIRTABLE_EVENTS_TABLE=tblEpybLYG9dJmtEz
PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_browser_key
```

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

## Publishing logic

Save as Draft:

- Status = Draft
- Portal Visible = unchecked

Publish to Rep Portal:

- Status = Scheduled
- Portal Visible = checked
