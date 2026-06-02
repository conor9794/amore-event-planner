const { TABLES, listRecords, createRecord } = require("./_airtable");

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

async function allBookings() {
  return listRecords(TABLES.BOOKINGS, { maxRecords: "1000" });
}

async function findExistingBooking(eventId, ambassadorId) {
  const records = await allBookings();
  return records.find((record) => {
    const f = record.fields || {};
    return linkedIds(f["Event"]).includes(eventId) && linkedIds(f["Ambassador"]).includes(ambassadorId);
  }) || null;
}

async function listBookingsForEvent(eventId) {
  const records = await allBookings();
  return records.filter((record) => linkedIds((record.fields || {})["Event"]).includes(eventId));
}

function optionalFieldsFor(body) {
  const fields = {};
  if (body.scheduledStart) fields["Scheduled Start Snapshot"] = body.scheduledStart;
  if (body.scheduledEnd) fields["Scheduled End Snapshot"] = body.scheduledEnd;
  if (body.sendSaveTheDate) fields["Send Save the Date"] = true;
  fields["Created From Planner Page"] = true;
  return fields;
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
      const { eventId, ambassadorId } = body;

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

      let created;
      let warning = "";
      try {
        created = await createRecord(TABLES.BOOKINGS, { ...requiredFields, ...optionalFieldsFor(body) });
      } catch (err) {
        const message = String(err.message || "");
        if (message.includes("Unknown field name") || message.includes("INVALID_VALUE_FOR_COLUMN")) {
          created = await createRecord(TABLES.BOOKINGS, requiredFields);
          warning = "Booking was created, but optional fields were skipped. Add Send Save the Date, Scheduled Start Snapshot, Scheduled End Snapshot, and Created From Planner Page to Bookings if you want those set automatically.";
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
