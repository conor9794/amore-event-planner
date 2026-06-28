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

function stateToTimeZone(state) {
  const s = String(state || "").trim().toUpperCase();
  const eastern = new Set(["CT", "DE", "FL", "GA", "MA", "MD", "ME", "MI", "NC", "NH", "NJ", "NY", "OH", "PA", "RI", "SC", "VA", "VT", "WV"]);
  const central = new Set(["AL", "AR", "IA", "IL", "LA", "MN", "MO", "MS", "OK", "TN", "TX", "WI"]);
  const mountain = new Set(["AZ", "CO", "ID", "MT", "NM", "UT", "WY"]);
  const pacific = new Set(["CA", "NV", "OR", "WA"]);

  if (pacific.has(s)) return "America/Los_Angeles";
  if (mountain.has(s)) return "America/Denver";
  if (central.has(s)) return "America/Chicago";
  if (eastern.has(s)) return "America/New_York";
  return "America/New_York";
}

function offsetForTimeZone(date, time, timeZone) {
  const probe = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(probe);

  const tzName = parts.find((part) => part.type === "timeZoneName")?.value || "GMT-5";
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);

  if (!match) return "-05:00";

  const sign = match[1];
  const hours = String(match[2]).padStart(2, "0");
  const minutes = String(match[3] || "00").padStart(2, "0");

  return `${sign}${hours}:${minutes}`;
}

function isoDateTimeInEventZone(date, time, state) {
  const timeZone = stateToTimeZone(state);
  const offset = offsetForTimeZone(date, time, timeZone);
  const [year, month, day] = String(date).split("-").map(Number);
  const [hour, minute] = String(time).split(":").map(Number);
  const match = offset.match(/([+-])(\d{2}):(\d{2})/);

  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute) || !match) {
    return `${date}T${time}:00${offset}`;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const offsetMinutes = sign * (Number(match[2]) * 60 + Number(match[3]));

  // Airtable stores date/time fields as an instant. Convert the event's local
  // wall-clock time into UTC before sending it, so 12:00 PM NY displays as
  // 12:00 PM EDT in Airtable instead of 8:00 AM EDT.
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMinutes * 60 * 1000;
  return new Date(utcMillis).toISOString();
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
      eventArea,
      startTime,
      endTime,
      hourlyRate,
      details
    } = body;

    if (!brandRecordId || !store || !eventDate || !eventArea || !startTime || !endTime || !hourlyRate) {
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
      "Event Area": eventArea,
      "Start Time": isoDateTimeInEventZone(eventDate, startTime, store.state || stateFromAddress(store.address)),
      "End Time": isoDateTimeInEventZone(eventDate, endTime, store.state || stateFromAddress(store.address)),
      "Hourly Rate": String(hourlyRate),
      "Status": publish ? "Requested" : "Draft",
      "Portal Visible": Boolean(publish),
      "Details": details || ""
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: createdEvent.id,
        storeId: storeRecordId,
        status: publish ? "Requested" : "Draft",
        portalVisible: Boolean(publish),
        eventArea
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
