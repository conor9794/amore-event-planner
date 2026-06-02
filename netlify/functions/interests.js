const { TABLES, listRecords } = require("./_airtable");

function linkedIds(value) {
  return Array.isArray(value) ? value : [];
}

function firstText(value) {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function value(fields, names) {
  for (const name of names) {
    if (fields && fields[name] !== undefined && fields[name] !== null && fields[name] !== "") return fields[name];
  }
  return "";
}

function interestSummary(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    eventIds: linkedIds(f["Event"]),
    ambassadorIds: linkedIds(f["Ambassador"]),
    ambassadorName: firstText(value(f, [
      "Ambassador Name",
      "Ambassador",
      "Available Rep Names",
      "BA Name",
      "Name"
    ])) || "Interested Ambassador",
    ambassadorEmail: firstText(value(f, [
      "Ambassador Email",
      "Ambassadors Email",
      "Email",
      "Email Address"
    ])),
    response: value(f, ["Response", "Status"]),
    convertedToBooking: Boolean(value(f, ["Converted to Booking", "Converted To Booking"]))
  };
}

async function listInterestsForEvent(eventId) {
  const records = await listRecords(TABLES.INTEREST, { maxRecords: "1000" });
  return records
    .filter((record) => linkedIds((record.fields || {})["Event"]).includes(eventId))
    .map(interestSummary)
    .filter((interest) => {
      const response = String(interest.response || "").toLowerCase();
      return !interest.convertedToBooking && (!response || response.includes("available") || response.includes("interested"));
    });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method not allowed." })
      };
    }

    const eventId = event.queryStringParameters?.eventId;
    if (!eventId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing eventId." })
      };
    }

    const interests = await listInterestsForEvent(eventId);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interests })
    };
  } catch (err) {
    // If the interest table name or fields differ, do not block assignment.
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interests: [], warning: err.message })
    };
  }
};
