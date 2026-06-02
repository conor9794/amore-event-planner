const { TABLES, listRecords } = require("./_airtable");

function value(fields, names) {
  for (const name of names) {
    if (fields && fields[name] !== undefined && fields[name] !== null && fields[name] !== "") return fields[name];
  }
  return "";
}

function asText(v) {
  if (Array.isArray(v)) return v.join(", ");
  return v || "";
}

exports.handler = async () => {
  try {
    const records = await listRecords(TABLES.EVENTS, {
      maxRecords: "100",
      "sort[0][field]": "Start Time",
      "sort[0][direction]": "asc"
    });

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const events = records
      .map((record) => {
        const f = record.fields || {};
        const startTime = value(f, ["Start Time", "Event Start Time"]);
        const eventDate = value(f, ["Event Date"]);
        const dateForFilter = startTime || eventDate;
        return {
          id: record.id,
          name: value(f, ["Event Name", "Name"]) || "Untitled Event",
          eventDate,
          startTime,
          endTime: value(f, ["End Time", "Event End Time"]),
          hourlyRate: value(f, ["Hourly Rate", "Pay Rate"]),
          status: value(f, ["Status"]),
          brand: asText(value(f, ["Brand Name", "Brand"])),
          store: asText(value(f, ["Store Name", "Store"])),
          address: asText(value(f, ["Store Address", "Address"])),
          dateForFilter
        };
      })
      .filter((event) => {
        if (!event.dateForFilter) return true;
        const d = new Date(event.dateForFilter);
        return Number.isNaN(d.getTime()) || d >= now;
      });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
