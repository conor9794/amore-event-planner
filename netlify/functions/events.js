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

function dateSortValue(event) {
  const raw = event.startTime || event.eventDate || event.dateForFilter || "";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

exports.handler = async () => {
  try {
    // Do not sort in Airtable. Different bases may use Start Time, Event Start Time, etc.
    const records = await listRecords(TABLES.EVENTS, {
      maxRecords: "300"
    });

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const events = records
      .map((record) => {
        const f = record.fields || {};
        const startTime = value(f, ["Start Time", "Event Start Time", "Scheduled Start", "Scheduled Start Snapshot"]);
        const eventDate = value(f, ["Event Date", "Date"]);
        const dateForFilter = startTime || eventDate;
        return {
          id: record.id,
          name: asText(value(f, ["Event Name", "Name", "Event", "Title"])) || "Untitled Event",
          eventDate,
          startTime,
          endTime: value(f, ["End Time", "Event End Time", "Scheduled End", "Scheduled End Snapshot"]),
          hourlyRate: value(f, ["Hourly Rate", "Pay Rate", "Event Pay Rate"]),
          status: value(f, ["Status"]),
          brand: asText(value(f, ["Brand Name", "Brand"])),
          store: asText(value(f, ["Store Name", "Store"])),
          address: asText(value(f, ["Store Address", "Address", "Full Address"])),
          dateForFilter
        };
      })
      .filter((event) => {
        if (!event.dateForFilter) return true;
        const d = new Date(event.dateForFilter);
        return Number.isNaN(d.getTime()) || d >= now;
      })
      .sort((a, b) => dateSortValue(a) - dateSortValue(b));

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
