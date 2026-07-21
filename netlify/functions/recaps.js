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
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function buildIdFormula(ids) {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return "FALSE()";
  return `OR(${unique.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
}

async function getRecord(table, recordId) {
  return airtableRequest(`${encodeURIComponent(table)}/${recordId}`);
}

async function recordsByIds(table, ids, fields) {
  const unique = [...new Set(ids)].filter(Boolean);
  const results = [];

  for (let index = 0; index < unique.length; index += 35) {
    const chunk = unique.slice(index, index + 35);
    const records = await listRecords(table, {
      filterByFormula: buildIdFormula(chunk),
      "fields[]": fields,
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
      const aTime = new Date(a.fields?.["Effective Timestamp"] || a.fields?.["Submitted At"] || 0).getTime();
      const bTime = new Date(b.fields?.["Effective Timestamp"] || b.fields?.["Submitted At"] || 0).getTime();
      return bTime - aTime;
    })[0] || null;
}

async function listRecaps() {
  const bookingFields = [
    "Assignment",
    "Event",
    "Ambassador",
    "Ambassadors Email",
    "Scheduled Start Snapshot",
    "Scheduled End Snapshot",
    "Clock In Timestamp",
    "Clock Out Timestamp",
    "Actual Hours Worked",
    "Actual Total Pay",
    "Pay Rate Snapshot",
    "Recap Notes",
    "Recap Photos",
    "Expense Amount",
    "Expense Receipt",
    "Recap Submitted Timestamp",
    "Time Entry"
  ];

  const bookings = await listRecords(TABLES.BOOKINGS, {
    filterByFormula: "AND({Recap Submitted Timestamp},NOT({Recap Approved}),NOT({Paid}))",
    "fields[]": bookingFields,
    "sort[0][field]": "Recap Submitted Timestamp",
    "sort[0][direction]": "asc",
    maxRecords: "1000"
  });

  const eventIds = bookings.flatMap((record) => linkedIds(record.fields?.Event));
  const ambassadorIds = bookings.flatMap((record) => linkedIds(record.fields?.Ambassador));
  const timeEntryIds = bookings.flatMap((record) => linkedIds(record.fields?.["Time Entry"]));

  const [events, ambassadors, timeEntries] = await Promise.all([
    recordsByIds(TABLES.EVENTS, eventIds, ["Event Name", "Brand Name", "Store Name", "Event Date"]),
    recordsByIds(TABLES.AMBASSADORS, ambassadorIds, ["Ambassador Name"]),
    recordsByIds(TIME_ENTRY_TABLE, timeEntryIds, [
      "Booking",
      "Entry Type",
      "Submitted At",
      "Effective Timestamp",
      "Recap Photos",
      "Event Photos",
      "Recap Notes",
      "Event Feedback",
      "Expense Amount",
      "Expense Receipt",
      "Leftover Inventory",
      "Store Contact Name",
      "Products Sampled.",
      "Consumers Seen",
      "Consumers Sampled",
      "Product Price",
      "Product Sold",
      "Table Location",
      "GPS Map Link",
      "Talkhouse - Flavors Carried",
      "Talkhouse - Blood Orange 4-Packs Sold",
      "Talkhouse - Grapefruit 4-Packs Sold",
      "Talkhouse - Pineapple 4-Packs Sold",
      "Talkhouse - Lime 4-Packs Sold",
      "Talkhouse - Cranberry 4-Packs Sold",
      "Talkhouse - Hampton Blue 4-Packs Sold",
      "Talkhouse - Iced Tea Lemonade 4-Packs Sold",
      "Talkhouse - Variety Packs Sold",
      "Talkhouse - Sold Out Details"
    ])
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
    const clockOut = latestClockOut(entriesByBookingId[booking.id] || []);
    const recapFields = clockOut?.fields || {};

    const recapPhotos = attachments(recapFields["Event Photos"] || recapFields["Recap Photos"] || fields["Recap Photos"]);
    const expenseReceipts = attachments(recapFields["Expense Receipt"] || fields["Expense Receipt"]);
    const actualHours = numberOrNull(fields["Actual Hours Worked"]);
    const actualPay = numberOrNull(fields["Actual Total Pay"]);

    const talkhouseSales = [
      ["Blood Orange", recapFields["Talkhouse - Blood Orange 4-Packs Sold"]],
      ["Grapefruit", recapFields["Talkhouse - Grapefruit 4-Packs Sold"]],
      ["Pineapple", recapFields["Talkhouse - Pineapple 4-Packs Sold"]],
      ["Lime", recapFields["Talkhouse - Lime 4-Packs Sold"]],
      ["Cranberry", recapFields["Talkhouse - Cranberry 4-Packs Sold"]],
      ["Hampton Blue", recapFields["Talkhouse - Hampton Blue 4-Packs Sold"]],
      ["Iced Tea Lemonade", recapFields["Talkhouse - Iced Tea Lemonade 4-Packs Sold"]],
      ["Variety Packs", recapFields["Talkhouse - Variety Packs Sold"]]
    ].filter(([, value]) => value !== undefined && value !== null && value !== "");

    return {
      bookingId: booking.id,
      assignment: fields.Assignment || "",
      event: {
        name: eventFields["Event Name"] || fields.Assignment || "Untitled Event",
        brand: first(eventFields["Brand Name"]),
        store: first(eventFields["Store Name"]),
        date: eventFields["Event Date"] || null
      },
      ambassador: {
        name: ambassadorFields["Ambassador Name"] || "",
        email: first(fields["Ambassadors Email"])
      },
      time: {
        scheduledStart: fields["Scheduled Start Snapshot"] || null,
        scheduledEnd: fields["Scheduled End Snapshot"] || null,
        clockIn: fields["Clock In Timestamp"] || null,
        clockOut: fields["Clock Out Timestamp"] || null,
        actualHours
      },
      recap: {
        submittedAt: fields["Recap Submitted Timestamp"] || recapFields["Effective Timestamp"] || null,
        notes: recapFields["Recap Notes"] || fields["Recap Notes"] || "",
        feedback: recapFields["Event Feedback"] || "",
        photos: recapPhotos,
        productsSampled: recapFields["Products Sampled."] || "",
        consumersSeen: numberOrNull(recapFields["Consumers Seen"]),
        consumersSampled: numberOrNull(recapFields["Consumers Sampled"]),
        productPrice: recapFields["Product Price"] || "",
        productSold: recapFields["Product Sold"] || "",
        tableLocation: recapFields["Table Location"] || "",
        leftoverInventory: recapFields["Leftover Inventory"] || "",
        storeContactName: recapFields["Store Contact Name"] || "",
        gpsMapLink: recapFields["GPS Map Link"] || "",
        talkhouse: {
          flavorsCarried: recapFields["Talkhouse - Flavors Carried"] || [],
          sales: talkhouseSales,
          soldOutDetails: recapFields["Talkhouse - Sold Out Details"] || ""
        }
      },
      expense: {
        amount: numberOrNull(recapFields["Expense Amount"] ?? fields["Expense Amount"]),
        receipts: expenseReceipts
      },
      payroll: {
        payRate: numberOrNull(fields["Pay Rate Snapshot"]),
        actualHours,
        totalPay: actualPay
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

  let booking;
  try {
    booking = await getRecord(TABLES.BOOKINGS, bookingId);
  } catch (error) {
    if (String(error.message || "").toLowerCase().includes("not found")) {
      return json(404, { error: "Booking not found." });
    }
    throw error;
  }

  const fields = booking.fields || {};
  if (!fields["Recap Submitted Timestamp"]) {
    return json(409, { error: "This booking has no submitted recap yet." });
  }
  if (fields["Recap Approved"]) {
    return json(409, { error: "This recap has already been approved." });
  }
  if (fields.Paid) {
    return json(409, { error: "This booking has already been paid." });
  }

  await updateRecord(TABLES.BOOKINGS, bookingId, { "Recap Approved": true });
  return json(200, { success: true, bookingId });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "GET") {
      return json(200, { recaps: await listRecaps() });
    }
    if (event.httpMethod === "PATCH" || event.httpMethod === "POST") {
      return approveRecap(event);
    }
    return json(405, { error: "Method not allowed." });
  } catch (error) {
    console.error("recaps error", error);
    return json(500, { error: error.message || "Recap request failed." });
  }
};
