import airtable from "./_airtable.js";

const { TABLES, airtableRequest, listRecords, updateRecord } = airtable;

function json(status, body) {
  return Response.json(body, { status });
}

function first(value) {
  return Array.isArray(value) ? (value[0] || "") : (value || "");
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return value || "";
}

export function scheduledHours(fields) {
  const storedHours = numberOrNull(fields["Hours Worked"]);
  if (storedHours !== null) return storedHours;

  const startValue = first(fields["Scheduled Start Snapshot"] || fields["Event Start Time (lookup)"]);
  const endValue = first(fields["Scheduled End Snapshot"] || fields["Event End Time (lookup)"]);
  if (!startValue || !endValue) return null;

  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  let hours = (end.getTime() - start.getTime()) / 3600000;
  if (hours < 0) hours += 24;
  return Math.round(hours * 100) / 100;
}

export function scheduledTotalPay(fields, hours, payRate) {
  const storedTotal = numberOrNull(fields["Total Pay"]);
  if (storedTotal !== null) return storedTotal;
  if (hours === null || payRate === null) return null;
  return Math.round(hours * payRate * 100) / 100;
}

export function createHandler(api = { TABLES, airtableRequest, listRecords, updateRecord }) {
  async function getRecord(recordId) {
    return api.airtableRequest(`${encodeURIComponent(api.TABLES.BOOKINGS)}/${recordId}`);
  }

  async function listPayroll() {
    const bookings = await api.listRecords(api.TABLES.BOOKINGS, {
      filterByFormula: "AND({Ready for Payroll},NOT({Paid}))",
      "sort[0][field]": "Recap Approved Timestamp",
      "sort[0][direction]": "asc",
      maxRecords: "1000"
    });

    return bookings.map((booking) => {
      const fields = booking.fields || {};
      const hours = scheduledHours(fields);
      const payRate = numberOrNull(fields["Pay Rate Snapshot"]);

      return {
        bookingId: booking.id,
        assignment: fields.Assignment || "Untitled Booking",
        ambassadorName: fields["Ambassador Name Text"] || "Unnamed Ambassador",
        ambassadorEmail: first(fields["Ambassadors Email"]),
        brand: text(fields.Brand),
        store: text(fields.Store),
        eventDate: fields["Event Day"] || fields["Event Date (formatted)"] || null,
        approvedAt: fields["Recap Approved Timestamp"] || null,
        payroll: {
          payRate,
          scheduledHours: hours,
          totalPay: scheduledTotalPay(fields, hours, payRate),
          expenseAmount: numberOrNull(fields["Expense Amount"]) || 0
        }
      };
    });
  }

  async function markPaid(request) {
    let body;
    try {
      body = await request.json();
    } catch (_error) {
      return json(400, { error: "Invalid JSON body." });
    }

    const bookingId = body.bookingId;
    if (!/^rec[A-Za-z0-9]{14}$/.test(String(bookingId || ""))) {
      return json(400, { error: "A valid bookingId is required." });
    }

    const booking = await getRecord(bookingId);
    const fields = booking.fields || {};
    if (!fields["Ready for Payroll"]) return json(409, { error: "This booking is not ready for payroll." });
    if (fields.Paid) return json(409, { error: "This booking has already been paid." });

    const hours = scheduledHours(fields);
    const payRate = numberOrNull(fields["Pay Rate Snapshot"]);
    const totalPay = scheduledTotalPay(fields, hours, payRate);
    if (totalPay === null) return json(409, { error: "Scheduled payroll is incomplete for this booking." });

    const paidTimestamp = new Date().toISOString();
    await api.updateRecord(api.TABLES.BOOKINGS, bookingId, {
      Paid: true,
      "Paid Timestamp": paidTimestamp
    });

    return json(200, { success: true, bookingId, paidTimestamp, totalPay });
  }

  return async function handler(request) {
    try {
      if (request.method === "GET") return json(200, { payroll: await listPayroll() });
      if (request.method === "PATCH" || request.method === "POST") return markPaid(request);
      return json(405, { error: "Method not allowed." });
    } catch (error) {
      console.error("payroll error", error);
      return json(500, { error: error.message || "Payroll request failed." });
    }
  };
}

export default createHandler();

export const config = {
  path: "/api/payroll"
};
