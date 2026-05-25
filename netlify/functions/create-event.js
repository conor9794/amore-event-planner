const { TABLES, listRecords, createRecord, updateRecord } = require("./_airtable");

function escapeFormulaString(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizeAddress(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/,\s*usa\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDateTime(date, time) {
  return `${date}T${time}:00`;
}

function stateFromAddress(address) {
  const match = String(address || "").match(/,\s*([A-Z]{2})\s+\d{5}/);
  return match ? match[1] : "";
}

async function findStoreByPlaceId(placeId) {
  if (!placeId) return null;

  const existing = await listRecords(TABLES.STORES, {
    maxRecords: "1",
    filterByFormula: `{Google Place ID} = '${escapeFormulaString(placeId)}'`
  });

  return existing[0] || null;
}

async function findStoreByAddress(address) {
  const cleanAddress = normalizeAddress(address);
  if (!cleanAddress) return null;

  const existing = await listRecords(TABLES.STORES, {
    maxRecords: "1",
    filterByFormula: `LOWER(SUBSTITUTE({Address}, ', USA', '')) = '${escapeFormulaString(cleanAddress)}'`
  });

  return existing[0] || null;
}

async function findStoreByNameAndState(store) {
  const name = String(store.name || "").trim().toLowerCase();
  const state = String(store.state || stateFromAddress(store.address) || "").trim().toUpperCase();
  if (!name || !state) return null;

  const existing = await listRecords(TABLES.STORES, {
    maxRecords: "1",
    filterByFormula: `AND(LOWER({Store Name}) = '${escapeFormulaString(name)}', {State} = '${escapeFormulaString(state)}')`
  });

  return existing[0] || null;
}

async function backfillStoreGoogleFields(recordId, store) {
  const fields = {};

  if (store.googlePlaceId) fields["Google Place ID"] = store.googlePlaceId;
  if (store.latitude !== null && store.latitude !== undefined) fields["Latitude"] = store.latitude;
  if (store.longitude !== null && store.longitude !== undefined) fields["Longitude"] = store.longitude;

  if (Object.keys(fields).length > 0) {
    await updateRecord(TABLES.STORES, recordId, fields);
  }
}

async function findOrCreateStore(store) {
  // 1. Best match: Google Place ID. This prevents future duplicates.
  let existing = await findStoreByPlaceId(store.googlePlaceId);
  if (existing) return existing.id;

  // 2. Backward-compatible match: existing Airtable stores may not have Google Place ID yet.
  existing = await findStoreByAddress(store.address);
  if (existing) {
    await backfillStoreGoogleFields(existing.id, store);
    return existing.id;
  }

  // 3. Safety fallback: exact Store Name + State.
  existing = await findStoreByNameAndState(store);
  if (existing) {
    await backfillStoreGoogleFields(existing.id, store);
    return existing.id;
  }

  const created = await createRecord(TABLES.STORES, {
    "Store Name": store.name,
    "Address": normalizeAddress(store.address).replace(/\b\w/g, c => c.toUpperCase()),
    "State": store.state || stateFromAddress(store.address),
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

    const storeRecordId = await findOrCreateStore(store);
    const eventName = `${brandName} @ ${store.name}`;

    const createdEvent = await createRecord(TABLES.EVENTS, {
      "Event Name": eventName,
      "Brand": [brandRecordId],
      "Store": [storeRecordId],
      "Event Date": eventDate,
      "Start Time": isoDateTime(eventDate, startTime),
      "End Time": isoDateTime(eventDate, endTime),
      "Hourly Rate": String(hourlyRate),
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
