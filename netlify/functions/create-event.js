const { getBase, TABLES } = require("./_airtable");

function escapeFormulaString(value) {
  return String(value || "").replace(/'/g, "\\'");
}

function isoDateTime(date, time) {
  return `${date}T${time}:00`;
}

async function findOrCreateStore(base, store) {
  const placeId = store.googlePlaceId;

  if (placeId) {
    const existing = await base(TABLES.STORES)
      .select({
        maxRecords: 1,
        filterByFormula: `{Google Place ID} = '${escapeFormulaString(placeId)}'`
      })
      .firstPage();

    if (existing.length > 0) return existing[0].id;
  }

  const created = await base(TABLES.STORES).create({
    "Store Name": store.name,
    "Address": store.address,
    "State": store.state,
    "Google Place ID": store.googlePlaceId,
    "Latitude": store.latitude,
    "Longitude": store.longitude
  });

  return created.id;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method not allowed." })
      };
    }

    const body = JSON.parse(event.body || "{}");
    const {
      publish,
      brandRecordId,
      brandName,
      store,
      eventDate,
      startTime,
      endTime,
      hourlyRate,
      details
    } = body;

    if (!brandRecordId || !store || !eventDate || !startTime || !endTime || !hourlyRate) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing required event fields." })
      };
    }

    const base = getBase();
    const storeRecordId = await findOrCreateStore(base, store);

    const eventName = `${brandName} @ ${store.name}`;

    const createdEvent = await base(TABLES.EVENTS).create({
      "Event Name": eventName,
      "Brand": [brandRecordId],
      "Store": [storeRecordId],
      "Event Date": eventDate,
      "Start Time": isoDateTime(eventDate, startTime),
      "End Time": isoDateTime(eventDate, endTime),
      "Hourly Rate": hourlyRate,
      "Status": publish ? "Scheduled" : "Draft",
      "Portal Visible": Boolean(publish),
      "Details": details || ""
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: createdEvent.id,
        storeId: storeRecordId,
        status: publish ? "Scheduled" : "Draft",
        portalVisible: Boolean(publish)
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
