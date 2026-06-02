const { TABLES, listRecords, createRecord, escapeFormulaString } = require("./_airtable");

function linkedIds(value) {
  return Array.isArray(value) ? value : [];
}

function firstText(value) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function bookingSummary(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    assignment: f["Assignment"] || "",
    eventIds: linkedIds(f["Event"]),
    ambassadorIds: linkedIds(f["Ambassador"]),
    ambassadorName: firstText(f["Ambassador Name"]) || firstText(f["Ambassador"]) || f["Assignment"] || "Booked Ambassador",
    ambassadorEmail: firstText(f["Ambassadors Email"]) || firstText(f["Ambassador Email"]),
    bookingConfirmed: Boolean(f["Booking Confirmed"]),
    saveTheDateSent: Boolean(f["Save the Date Sent"])
  };
}

async function findExistingBooking(eventId, ambassadorId) {
  const formula = `AND(FIND('${escapeFormulaString(eventId)}', ARRAYJOIN({Event})), FIND('${escapeFormulaString(ambassadorId)}', ARRAYJOIN({Ambassador})))`;
  const records = await listRecords(TABLES.BOOKINGS, {
    maxRecords: "1",
    filterByFormula: formula
  });
  return records[0] || null;
}

async function listBookingsForEvent(eventId) {
  const formula = `FIND('${escapeFormulaString(eventId)}', ARRAYJOIN({Event}))`;
  return listRecords(TABLES.BOOKINGS, {
    maxRecords: "100",
    filterByFormula: formula
  });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "GET") {
      const eventId = event.queryStringParameters?.eventId;
      if (!eventId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Missing eventId." })
        };
      }

      const records = await listBookingsForEvent(eventId);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookings: records.map(bookingSummary) })
      };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { eventId, ambassadorId, scheduledStart, scheduledEnd, sendSaveTheDate = true } = body;

      if (!eventId || !ambassadorId) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Select both an event and an ambassador." })
        };
      }

      const existing = await findExistingBooking(eventId, ambassadorId);
      if (existing) {
        return {
          statusCode: 409,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "This ambassador is already booked for this event.", booking: bookingSummary(existing) })
        };
      }

      const requiredFields = {
        "Event": [eventId],
        "Ambassador": [ambassadorId]
      };

      if (scheduledStart) requiredFields["Scheduled Start Snapshot"] = scheduledStart;
      if (scheduledEnd) requiredFields["Scheduled End Snapshot"] = scheduledEnd;

      const optionalFields = {};
      if (sendSaveTheDate) optionalFields["Send Save the Date"] = true;
      optionalFields["Created From Planner Page"] = true;

      let created;
      let warning = "";
      try {
        created = await createRecord(TABLES.BOOKINGS, { ...requiredFields, ...optionalFields });
      } catch (err) {
        const message = String(err.message || "");
        if (message.includes("Unknown field name") || message.includes("INVALID_VALUE_FOR_COLUMN")) {
          created = await createRecord(TABLES.BOOKINGS, requiredFields);
          warning = "Booking was created, but optional checkbox fields were skipped. Add Send Save the Date and Created From Planner Page to Bookings if you want those fields set automatically.";
        } else {
          throw err;
        }
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking: bookingSummary(created), warning })
      };
    }

    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed." })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
