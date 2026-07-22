const { TABLES, listRecords } = require("./_airtable");

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}

function linkedIds(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function first(value) {
  return Array.isArray(value) ? (value[0] || "") : (value || "");
}

function value(fields, names) {
  for (const name of names) {
    const candidate = fields?.[name];
    if (candidate !== undefined && candidate !== null && candidate !== "") return candidate;
  }
  return "";
}

function text(fields, names) {
  const found = value(fields, names);
  return Array.isArray(found) ? found.join(", ") : String(found || "");
}

function buildIdFormula(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return "FALSE()";
  return `OR(${unique.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
}

async function recordsByIds(table, ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  const results = [];
  for (let index = 0; index < unique.length; index += 35) {
    const chunk = unique.slice(index, index + 35);
    const records = await listRecords(table, {
      filterByFormula: buildIdFormula(chunk),
      maxRecords: "1000"
    });
    results.push(...records);
  }
  return results;
}

function stateToTimeZone(state) {
  const normalized = String(state || "").trim().toUpperCase();
  const eastern = new Set(["CT", "DE", "FL", "GA", "MA", "MD", "ME", "MI", "NC", "NH", "NJ", "NY", "OH", "PA", "RI", "SC", "VA", "VT", "WV"]);
  const central = new Set(["AL", "AR", "IA", "IL", "LA", "MN", "MO", "MS", "OK", "TN", "TX", "WI"]);
  const mountain = new Set(["AZ", "CO", "ID", "MT", "NM", "UT", "WY"]);
  const pacific = new Set(["CA", "NV", "OR", "WA"]);
  if (pacific.has(normalized)) return "America/Los_Angeles";
  if (mountain.has(normalized)) return normalized === "AZ" ? "America/Phoenix" : "America/Denver";
  if (central.has(normalized)) return "America/Chicago";
  if (eastern.has(normalized)) return "America/New_York";
  return "America/New_York";
}

function validTimeZone(candidate) {
  const zone = String(candidate || "").trim();
  if (!zone) return "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch (_error) {
    return "";
  }
}

function localDateKey(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function validDateKey(candidate) {
  const dateKey = String(candidate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "";
  const date = new Date(`${dateKey}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : dateKey;
}

function localTimeLabel(value, timeZone) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function statusFor(fields, scheduledStart, now) {
  const clockOut = value(fields, ["Clock Out Timestamp"]);
  const clockIn = value(fields, ["Clock In Timestamp"]);
  if (clockOut) return "completed";
  if (clockIn) return "checked-in";
  const start = new Date(scheduledStart);
  if (!Number.isNaN(start.getTime()) && now.getTime() >= start.getTime()) return "late";
  return "upcoming";
}

exports.handler = async (event) => {
  try {
    const now = new Date();
    const requestedDate = event?.queryStringParameters?.date;
    const selectedDate = validDateKey(requestedDate) || localDateKey(now, "America/New_York");

    if (requestedDate && !validDateKey(requestedDate)) {
      return json(400, { error: "Date must use YYYY-MM-DD format." });
    }

    const bookings = await listRecords(TABLES.BOOKINGS, { maxRecords: "1000" });
    const eligible = bookings.filter((record) => {
      const fields = record.fields || {};
      return Boolean(fields["Booking Confirmed"]) && !Boolean(fields.Paid);
    });

    const eventIds = eligible.flatMap((record) => linkedIds(record.fields?.Event));
    const ambassadorIds = eligible.flatMap((record) => linkedIds(record.fields?.Ambassador));
    const [events, ambassadors] = await Promise.all([
      recordsByIds(TABLES.EVENTS, eventIds),
      recordsByIds(TABLES.AMBASSADORS, ambassadorIds)
    ]);

    const storeIds = events.flatMap((record) => linkedIds(value(record.fields, ["Store"])));
    const brandIds = events.flatMap((record) => linkedIds(value(record.fields, ["Brand"])));
    const [stores, brands] = await Promise.all([
      recordsByIds(TABLES.STORES, storeIds),
      recordsByIds(TABLES.BRANDS, brandIds)
    ]);

    const eventById = Object.fromEntries(events.map((record) => [record.id, record.fields || {}]));
    const ambassadorById = Object.fromEntries(ambassadors.map((record) => [record.id, record.fields || {}]));
    const storeById = Object.fromEntries(stores.map((record) => [record.id, record.fields || {}]));
    const brandById = Object.fromEntries(brands.map((record) => [record.id, record.fields || {}]));

    const items = eligible.map((booking) => {
      const fields = booking.fields || {};
      const eventFields = eventById[linkedIds(fields.Event)[0]] || {};
      const ambassadorFields = ambassadorById[linkedIds(fields.Ambassador)[0]] || {};
      const storeFields = storeById[linkedIds(value(eventFields, ["Store"]))[0]] || {};
      const brandFields = brandById[linkedIds(value(eventFields, ["Brand"]))[0]] || {};
      const scheduledStart = value(fields, ["Scheduled Start Snapshot", "Event Start Time", "Event Start Time (lookup)"]) || value(eventFields, ["Start Time", "Event Start Time"]);
      const scheduledEnd = value(fields, ["Scheduled End Snapshot", "Event End Time", "Event End Time (lookup)"]) || value(eventFields, ["End Time", "Event End Time"]);
      const explicitZone = validTimeZone(value(storeFields, ["Store Timezone", "Timezone", "Time Zone", "IANA Timezone"]));
      const timeZone = explicitZone || stateToTimeZone(value(storeFields, ["State", "Store State"]));
      const startDate = new Date(scheduledStart);
      const isSelectedDate = scheduledStart && !Number.isNaN(startDate.getTime()) && localDateKey(startDate, timeZone) === selectedDate;
      if (!isSelectedDate) return null;

      const eventName = text(eventFields, ["Event Name", "Name", "Event", "Title"]) || fields.Assignment || "Untitled Event";
      const storeName = text(storeFields, ["Store Name", "Name"]) || text(eventFields, ["Store Name", "Account Name"]);
      const brandName = text(brandFields, ["Brand Name", "Name"]) || text(eventFields, ["Brand Name"]);
      const status = statusFor(fields, scheduledStart, now);

      return {
        bookingId: booking.id,
        eventName,
        brandName,
        storeName,
        ambassadorName: text(ambassadorFields, ["Ambassador Name", "Full Name", "Name"]) || "Unassigned",
        ambassadorEmail: first(value(fields, ["Ambassadors Email", "Ambassador Email"])),
        scheduledStart,
        scheduledEnd,
        scheduledLabel: `${localTimeLabel(scheduledStart, timeZone)} – ${localTimeLabel(scheduledEnd, timeZone)}`,
        clockIn: value(fields, ["Clock In Timestamp"]) || null,
        clockOut: value(fields, ["Clock Out Timestamp"]) || null,
        clockInLabel: localTimeLabel(value(fields, ["Clock In Timestamp"]), timeZone),
        clockOutLabel: localTimeLabel(value(fields, ["Clock Out Timestamp"]), timeZone),
        timeZone,
        status
      };
    }).filter(Boolean).sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart));

    const counts = items.reduce((totals, item) => {
      totals.total += 1;
      totals[item.status] += 1;
      return totals;
    }, { total: 0, upcoming: 0, "checked-in": 0, late: 0, completed: 0 });

    return json(200, { generatedAt: now.toISOString(), selectedDate, counts, events: items });
  } catch (error) {
    console.error("todays-events error", error);
    return json(500, { error: error.message || "Could not load events." });
  }
};