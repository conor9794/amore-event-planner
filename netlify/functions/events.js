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

function isAirtableRecordId(value) {
  return /^rec[a-zA-Z0-9]{10,}$/.test(String(value || "").trim());
}

function linkedIds(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => String(item || "").trim()).filter(isAirtableRecordId);
}

function safeLinkedText(v) {
  const values = Array.isArray(v) ? v : [v];
  return values
    .map((item) => String(item || "").trim())
    .filter((item) => item && !isAirtableRecordId(item))
    .join(", ");
}

function storeNameFromEventName(eventName) {
  const text = String(eventName || "");
  const marker = " @ ";
  const index = text.indexOf(marker);
  return index >= 0 ? text.slice(index + marker.length).trim() : "";
}

function dateSortValue(event) {
  const raw = event.startTime || event.eventDate || event.dateForFilter || "";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

exports.handler = async () => {
  try {
    const [records, brandRecords] = await Promise.all([
      listRecords(TABLES.EVENTS),
      listRecords(TABLES.BRANDS)
    ]);

    const brandNameById = Object.fromEntries(
      brandRecords.map((record) => [
        record.id,
        record.fields?.["Brand Name"] || record.fields?.Name || ""
      ])
    );

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const events = records
      .map((record) => {
        const f = record.fields || {};
        const startTime = value(f, ["Start Time", "Event Start Time", "Scheduled Start", "Scheduled Start Snapshot"]);
        const eventDate = value(f, ["Event Date", "Date"]);
        const endTime = value(f, ["End Time", "Event End Time", "Scheduled End", "Scheduled End Snapshot"]);
        const dateForFilter = startTime || eventDate;
        const name = asText(value(f, ["Event Name", "Name", "Event", "Title"])) || "Untitled Event";
        const storeLookup = safeLinkedText(value(f, ["Store Name"]));
        const store = storeLookup || storeNameFromEventName(name);
        const brandLookup = safeLinkedText(value(f, ["Brand Name"]));
        const brandIds = linkedIds(value(f, ["Brand"]));
        const resolvedBrand = brandIds.map((id) => brandNameById[id]).filter(Boolean).join(", ");

        return {
          id: record.id,
          name,
          eventDate,
          startTime,
          endTime,
          hourlyRate: value(f, ["Hourly Rate", "Pay Rate", "Event Pay Rate"]),
          status: value(f, ["Status"]),
          brand: brandLookup || resolvedBrand || safeLinkedText(value(f, ["Brand"])),
          store,
          address: asText(value(f, ["Store Address", "Address", "Full Address"])),
          dateForFilter
        };
      })
      .filter((event) => {
        if (!event.eventDate || !event.startTime || !event.endTime) return false;
        const d = new Date(event.startTime || event.eventDate);
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
