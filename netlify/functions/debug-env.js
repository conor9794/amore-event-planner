exports.handler = async () => {
  const token = process.env.AIRTABLE_TOKEN || "";
  const safe = {
    airtableTokenPresent: Boolean(token),
    airtableTokenStartsWithPat: token.startsWith("pat"),
    airtableTokenLength: token.length,
    airtableBaseId: process.env.AIRTABLE_BASE_ID || "",
    airtableBrandsTable: process.env.AIRTABLE_BRANDS_TABLE || "",
    airtableStoresTable: process.env.AIRTABLE_STORES_TABLE || "",
    airtableEventsTable: process.env.AIRTABLE_EVENTS_TABLE || "",
    airtableAmbassadorsTable: process.env.AIRTABLE_AMBASSADORS_TABLE || "Ambassadors",
    airtableBookingsTable: process.env.AIRTABLE_BOOKINGS_TABLE || "Bookings",
    googleMapsKeyPresent: Boolean(process.env.PUBLIC_GOOGLE_MAPS_API_KEY || "")
  };

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(safe, null, 2)
  };
};
