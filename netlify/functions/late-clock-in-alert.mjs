import airtable from "./_airtable.js";
import alertCore from "./_late-alert-core.js";

const { TABLES, listRecords, updateRecord } = airtable;
const { shouldSendLateAlert, lateAlertMessage } = alertCore;

function env(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || "";
}

function requiredSmsConfig() {
  const config = {
    accountSid: env("TWILIO_ACCOUNT_SID"),
    authToken: env("TWILIO_AUTH_TOKEN"),
    from: env("TWILIO_FROM_NUMBER"),
    to: env("LATE_ALERT_TO_NUMBER")
  };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Late-alert SMS is not configured: ${missing.join(", ")}`);
  return config;
}

async function sendSms(message) {
  const config = requiredSmsConfig();
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ To: config.to, From: config.from, Body: message })
  });
  if (!response.ok) throw new Error(`Twilio rejected the late alert with status ${response.status}`);
}

export default async () => {
  const now = new Date();
  const bookings = await listRecords(TABLES.BOOKINGS, {
    filterByFormula: "AND({Booking Confirmed},NOT({Clock In Timestamp}),NOT({Late Clock In Alert Sent}),{Scheduled Start Snapshot})",
    maxRecords: "1000"
  });
  const due = bookings.filter((record) => shouldSendLateAlert({
    bookingConfirmed: record.fields?.["Booking Confirmed"],
    clockIn: record.fields?.["Clock In Timestamp"],
    alertSent: record.fields?.["Late Clock In Alert Sent"],
    scheduledStart: record.fields?.["Scheduled Start Snapshot"],
    now
  }));

  const failures = [];
  let sent = 0;
  for (const booking of due) {
    try {
      await sendSms(lateAlertMessage(booking.fields));
      await updateRecord(TABLES.BOOKINGS, booking.id, { "Late Clock In Alert Sent": true });
      sent += 1;
    } catch (error) {
      failures.push({ bookingId: booking.id, error: error.message || "Late alert failed" });
    }
  }

  return new Response(JSON.stringify({ checked: bookings.length, due: due.length, sent, failures }), {
    status: failures.length ? 500 : 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
};

export const config = { schedule: "* * * * *" };
