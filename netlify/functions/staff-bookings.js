const { TABLES, airtableRequest, listRecords } = require("./_airtable");

function linkedIds(value) {
  return Array.isArray(value) ? value : [];
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

async function getBooking(bookingId) {
  return airtableRequest(`${encodeURIComponent(TABLES.BOOKINGS)}/${bookingId}`);
}

function bookingHasHistory(fields) {
  return Boolean(
    fields["Clock In Timestamp"] ||
    fields["Clock Out Timestamp"] ||
    fields["Recap Submitted Timestamp"] ||
    fields["Recap Approved"] ||
    fields["Ready for Payroll"] ||
    fields.Paid
  );
}

function assertBookingCanChange(record) {
  if (bookingHasHistory(record.fields || {})) {
    const err = new Error("This booking already has attendance, recap, or payroll history and cannot be changed from the planner.");
    err.statusCode = 409;
    throw err;
  }
}

async function ensureNoDuplicate(eventIds, ambassadorId, bookingId) {
  if (!eventIds.length) return;
  const records = await listRecords(TABLES.BOOKINGS, { maxRecords: "1000" });
  const duplicate = records.find((record) => {
    if (record.id === bookingId) return false;
    const fields = record.fields || {};
    return linkedIds(fields["Event"]).some((id) => eventIds.includes(id)) &&
      linkedIds(fields["Ambassador"]).includes(ambassadorId);
  });

  if (duplicate) {
    const err = new Error("That ambassador is already booked for this event.");
    err.statusCode = 409;
    throw err;
  }
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const bookingId = body.bookingId;

    if (!bookingId) return json(400, { error: "Missing bookingId." });

    if (event.httpMethod === "PATCH") {
      const ambassadorId = body.ambassadorId;
      if (!ambassadorId) return json(400, { error: "Select a replacement ambassador." });

      const current = await getBooking(bookingId);
      assertBookingCanChange(current);
      const eventIds = linkedIds((current.fields || {})["Event"]);
      await ensureNoDuplicate(eventIds, ambassadorId, bookingId);

      const fields = {
        "Ambassador": [ambassadorId],
        "Booking Confirmed": false,
        "Booking Confirmed Email Sent": false,
        "Pay Rate Snapshot": null,
        "Send Save the Date": false,
        "Save the Date Sent": false
      };

      const updated = await airtableRequest(`${encodeURIComponent(TABLES.BOOKINGS)}/${bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({ fields })
      });

      return json(200, {
        booking: updated,
        message: "Staff changed. The replacement ambassador is now unconfirmed and can be confirmed from Confirm Booking."
      });
    }

    if (event.httpMethod === "DELETE") {
      const current = await getBooking(bookingId);
      assertBookingCanChange(current);
      await airtableRequest(`${encodeURIComponent(TABLES.BOOKINGS)}/${bookingId}`, {
        method: "DELETE"
      });

      return json(200, { deleted: true });
    }

    return json(405, { error: "Method not allowed." });
  } catch (err) {
    return json(err.statusCode || 500, { error: err.message || "Staffing update failed." });
  }
};

exports.bookingHasHistory = bookingHasHistory;
exports.assertBookingCanChange = assertBookingCanChange;
