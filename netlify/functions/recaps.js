const { TABLES, airtableRequest, listRecords, updateRecord } = require("./_airtable");

const TIME_ENTRY_TABLE = process.env.AIRTABLE_TIME_ENTRY_TABLE || "Time Entry";

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

function first(value) {
  return Array.isArray(value) ? (value[0] || "") : (value || "");
}

function linkedIds(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
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
  return Array.isArray(found) ? found.join(", ") : (found || "");
}

function attachments(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    id: item.id || item.url,
    url: item.url,
    thumbnailUrl: item.thumbnails?.large?.url || item.thumbnails?.small?.url || item.url,
    filename: item.filename || "Photo"
  }));
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scheduledHours(startValue, endValue) {
  if (!startValue || !endValue) return null;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  let hours = (end.getTime() - start.getTime()) / 3600000;
  if (hours < 0) hours += 24;
  return Math.round(hours * 2) / 2;
}

function buildIdFormula(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return "FALSE()";
  return `OR(${unique.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
}

async function getRecord(table, recordId) {
  return airtableRequest(`${encodeURIComponent(table)}/${recordId}`);
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

function latestClockOut(entries) {
  return entries
    .filter((entry) => entry.fields?.["Entry Type"] === "Clock Out")
    .sort((a, b) => {
      const aTime = new Date(value(a.fields, ["Effective Timestamp", "Submitted At"]) || 0).getTime();
      const bTime = new Date(value(b.fields, ["Effective Timestamp", "Submitted At"]) || 0).getTime();
      return bTime - aTime;
    })[0] || null;
}

async function listRecaps() {
  const bookings = await listRecords(TABLES.BOOKINGS, {
    filterByFormula: "AND({Recap Submitted Timestamp},NOT({Recap Approved}),NOT({Paid}))",
    "sort[0][field]": "Recap Submitted Timestamp",
    "sort[0][direction]": "asc",
    maxRecords: "1000"
  });

  const eventIds = bookings.flatMap((record) => linkedIds(record.fields?.Event));
  const ambassadorIds = bookings.flatMap((record) => linkedIds(record.fields?.Ambassador));
  const timeEntryIds = bookings.flatMap((record) => linkedIds(record.fields?.["Time Entry"]));

  const [events, ambassadors, timeEntries] = await Promise.all([
    recordsByIds(TABLES.EVENTS, eventIds),
    recordsByIds(TABLES.AMBASSADORS, ambassadorIds),
    recordsByIds(TIME_ENTRY_TABLE, timeEntryIds)
  ]);

  const eventById = Object.fromEntries(events.map((record) => [record.id, record.fields || {}]));
  const ambassadorById = Object.fromEntries(ambassadors.map((record) => [record.id, record.fields || {}]));
  const entriesByBookingId = {};

  timeEntries.forEach((entry) => {
    linkedIds(entry.fields?.Booking).forEach((bookingId) => {
      entriesByBookingId[bookingId] ||= [];
      entriesByBookingId[bookingId].push(entry);
    });
  });

  return bookings.map((booking) => {
    const fields = booking.fields || {};
    const eventFields = eventById[linkedIds(fields.Event)[0]] || {};
    const ambassadorFields = ambassadorById[linkedIds(fields.Ambassador)[0]] || {};
    const recapFields = latestClockOut(entriesByBookingId[booking.id] || [])?.fields || {};

    const scheduledStart = value(fields, ["Scheduled Start Snapshot", "Event Start Time", "Event Start Time (lookup)"]) || null;
    const scheduledEnd = value(fields, ["Scheduled End Snapshot", "Event End Time", "Event End Time (lookup)"]) || null;
    const hours = scheduledHours(scheduledStart, scheduledEnd);
    const payRate = numberOrNull(fields["Pay Rate Snapshot"]);
    const totalPay = hours !== null && payRate !== null ? Math.round(hours * payRate * 100) / 100 : null;

    const talkhouseSales = [
      ["Blood Orange", recapFields["Talkhouse - Blood Orange 4-Packs Sold"]],
      ["Grapefruit", recapFields["Talkhouse - Grapefruit 4-Packs Sold"]],
      ["Pineapple", recapFields["Talkhouse - Pineapple 4-Packs Sold"]],
      ["Lime", recapFields["Talkhouse - Lime 4-Packs Sold"]],
      ["Cranberry", recapFields["Talkhouse - Cranberry 4-Packs Sold"]],
      ["Hampton Blue", recapFields["Talkhouse - Hampton Blue 4-Packs Sold"]],
      ["Iced Tea Lemonade", recapFields["Talkhouse - Iced Tea Lemonade 4-Packs Sold"]],
      ["Variety Packs", recapFields["Talkhouse - Variety Packs Sold"]]
    ].filter(([, item]) => item !== undefined && item !== null && item !== "");

    return {
      bookingId: booking.id,
      assignment: fields.Assignment || "",
      event: {
        name: text(eventFields, ["Event Name", "Name", "Event", "Title"]) || fields.Assignment || "Untitled Event",
        brand: text(eventFields, ["Brand Name", "Brand"]),
        store: text(eventFields, ["Store Name", "Store", "Account Name"]),
        date: value(eventFields, ["Event Date", "Date"]) || null
      },
      ambassador: {
        name: text(ambassadorFields, ["Ambassador Name", "Full Name", "Name"]),
        email: first(value(fields, ["Ambassadors Email", "Ambassador Email"]))
      },
      time: {
        scheduledStart,
        scheduledEnd,
        clockIn: value(fields, ["Clock In Timestamp"]) || null,
        clockOut: value(fields, ["Clock Out Timestamp"]) || null,
        actualHours: numberOrNull(fields["Actual Hours Worked"])
      },
      recap: {
        submittedAt: value(fields, ["Recap Submitted Timestamp"]) || value(recapFields, ["Effective Timestamp", "Submitted At"]) || null,
        notes: text(recapFields, ["Recap Notes"]) || text(fields, ["Recap Notes"]),
        feedback: text(recapFields, ["Event Feedback"]),
        photos: attachments(value(recapFields, ["Event Photos", "Recap Photos"]) || fields["Recap Photos"]),
        productsSampled: text(recapFields, ["Products Sampled.", "Products Sampled"]),
        consumersSeen: numberOrNull(value(recapFields, ["Consumers Seen"])),
        consumersSampled: numberOrNull(value(recapFields, ["Consumers Sampled"])),
        productPrice: text(recapFields, ["Product Price"]),
        productSold: text(recapFields, ["Product Sold"]),
        tableLocation: text(recapFields, ["Table Location"]),
        leftoverInventory: text(recapFields, ["Leftover Inventory"]),
        storeContactName: text(recapFields, ["Store Contact Name"]),
        gpsMapLink: text(recapFields, ["GPS Map Link"]),
        talkhouse: {
          flavorsCarried: value(recapFields, ["Talkhouse - Flavors Carried"]) || [],
          sales: talkhouseSales,
          soldOutDetails: text(recapFields, ["Talkhouse - Sold Out Details"])
        }
      },
      expense: {
        amount: numberOrNull(value(recapFields, ["Expense Amount"]) || fields["Expense Amount"]),
        receipts: attachments(value(recapFields, ["Expense Receipt"]) || fields["Expense Receipt"])
      },
      payroll: {
        payRate,
        scheduledHours: hours,
        totalPay
      }
    };
  });
}

async function approveRecap(event) {
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { error: "Invalid JSON body." });
  }

  const bookingId = body.bookingId;
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(bookingId || ""))) {
    return json(400, { error: "A valid bookingId is required." });
  }

  const booking = await getRecord(TABLES.BOOKINGS, bookingId);
  const fields = booking.fields || {};
  if (!fields["Recap Submitted Timestamp"]) return json(409, { error: "This booking has no submitted recap yet." });
  if (fields["Recap Approved"]) return json(409, { error: "This recap has already been approved." });
  if (fields.Paid) return json(409, { error: "This booking has already been paid." });

  await updateRecord(TABLES.BOOKINGS, bookingId, { "Recap Approved": true });
  return json(200, { success: true, bookingId });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "GET") return json(200, { recaps: await listRecaps() });
    if (event.httpMethod === "PATCH" || event.httpMethod === "POST") return approveRecap(event);
    return json(405, { error: "Method not allowed." });
  } catch (error) {
    console.error("recaps error", error);
    return json(500, { error: error.message || "Recap request failed." });
  }
};