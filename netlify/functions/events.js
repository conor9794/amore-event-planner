const airtable = require("./_airtable");

const { TABLES, airtableRequest, listRecords, updateRecord } = airtable;

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

function isAirtableRecordId(input) {
  return /^rec[a-zA-Z0-9]{14}$/.test(String(input || "").trim());
}

function linkedIds(input) {
  const values = Array.isArray(input) ? input : [input];
  return values.map((item) => String(item || "").trim()).filter(isAirtableRecordId);
}

function safeLinkedText(v) {
  const values = Array.isArray(v) ? v : [v];
  return values.map((item) => String(item || "").trim()).filter((item) => item && !isAirtableRecordId(item)).join(", ");
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

function stateToTimeZone(state) {
  const s = String(state || "").trim().toUpperCase();
  const central = new Set(["AL", "AR", "IA", "IL", "LA", "MN", "MO", "MS", "OK", "TN", "TX", "WI"]);
  const mountain = new Set(["AZ", "CO", "ID", "MT", "NM", "UT", "WY"]);
  const pacific = new Set(["CA", "NV", "OR", "WA"]);
  if (pacific.has(s)) return "America/Los_Angeles";
  if (mountain.has(s)) return "America/Denver";
  if (central.has(s)) return "America/Chicago";
  return "America/New_York";
}

function localDateForState(input, state) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: stateToTimeZone(state),
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(input);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function calendarDaysBetween(earlier, later) {
  const start = new Date(`${String(earlier).slice(0, 10)}T12:00:00Z`);
  const end = new Date(`${String(later).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function eventIsPast(event, now) {
  return String(event.eventDate || "").slice(0, 10) < localDateForState(now, event.state);
}

function offsetForTimeZone(date, time, timeZone) {
  const probe = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset", hour: "2-digit", minute: "2-digit" }).formatToParts(probe);
  const tzName = parts.find((part) => part.type === "timeZoneName")?.value || "GMT-5";
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return "-05:00";
  return `${match[1]}${String(match[2]).padStart(2, "0")}:${String(match[3] || "00").padStart(2, "0")}`;
}

function isoDateTimeInEventZone(date, time, state) {
  const offset = offsetForTimeZone(date, time, stateToTimeZone(state));
  const [year, month, day] = String(date).split("-").map(Number);
  const [hour, minute] = String(time).split(":").map(Number);
  const match = offset.match(/([+-])(\d{2}):(\d{2})/);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute) || !match) throw new Error("Enter a valid event date and time.");
  const sign = match[1] === "-" ? -1 : 1;
  const offsetMinutes = sign * (Number(match[2]) * 60 + Number(match[3]));
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - offsetMinutes * 60000).toISOString();
}

function addDays(date, count) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Enter a valid event date.");
  parsed.setUTCDate(parsed.getUTCDate() + count);
  return parsed.toISOString().slice(0, 10);
}

function localTimePart(input, state) {
  const parsed = new Date(input);
  if (!input || Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: stateToTimeZone(state), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(parsed);
}

function bookingHasHistory(fields) {
  return Boolean(fields["Clock In Timestamp"] || fields["Clock Out Timestamp"] || fields["Recap Submitted Timestamp"] || fields["Recap Approved"] || fields["Ready for Payroll"] || fields.Paid);
}

function bookingAmbassadorName(fields) {
  const direct = asText(value(fields, ["Ambassador Name Text", "Ambassador Name", "Ambassador Full Name"]));
  if (direct) return direct;
  const assignment = String(fields?.Assignment || "");
  return assignment.includes("—") ? assignment.split("—").pop().trim() : "";
}

function checkboxValue(input) {
  return input === true || input === 1 || input === "1" || String(input || "").toLowerCase() === "true";
}

function isValidDateInput(input) {
  const match = String(input || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isValidTimeInput(input) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(input || ""));
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body)
  };
}

function createHandler(api = { TABLES, airtableRequest, listRecords, updateRecord }) {
  async function listEvents(options = {}) {
    const [records, brandRecords, storeRecords, bookingRecords] = await Promise.all([
      api.listRecords(api.TABLES.EVENTS),
      api.listRecords(api.TABLES.BRANDS),
      api.listRecords(api.TABLES.STORES),
      api.listRecords(api.TABLES.BOOKINGS, { maxRecords: "1000" })
    ]);
    const brandNameById = Object.fromEntries(brandRecords.map((record) => [record.id, record.fields?.["Brand Name"] || record.fields?.Name || ""]));
    const storeById = Object.fromEntries(storeRecords.map((record) => [record.id, record.fields || {}]));
    const bookingsByEventId = {};
    bookingRecords.forEach((record) => {
      linkedIds(record.fields?.Event).forEach((eventId) => {
        bookingsByEventId[eventId] ||= [];
        bookingsByEventId[eventId].push(record);
      });
    });
    const view = ["upcoming", "past", "all"].includes(options.view) ? options.view : "upcoming";
    const requestedDays = Number(options.days);
    const days = Number.isFinite(requestedDays) ? Math.min(365, Math.max(1, Math.floor(requestedDays))) : 90;
    const now = typeof api.now === "function" ? api.now() : new Date();

    return records.map((record) => {
      const f = record.fields || {};
      const startTime = value(f, ["Start Time", "Event Start Time", "Scheduled Start", "Scheduled Start Snapshot"]);
      const eventDate = value(f, ["Event Date", "Date"]);
      const endTime = value(f, ["End Time", "Event End Time", "Scheduled End", "Scheduled End Snapshot"]);
      const name = asText(value(f, ["Event Name", "Name", "Event", "Title"])) || "Untitled Event";
      const storeIds = linkedIds(value(f, ["Store"]));
      const storeRecord = storeById[storeIds[0]] || {};
      const storeLookup = safeLinkedText(value(f, ["Store Name"]));
      const store = storeLookup || storeRecord["Store Name"] || storeNameFromEventName(name);
      const brandLookup = safeLinkedText(value(f, ["Brand Name"]));
      const brandIds = linkedIds(value(f, ["Brand"]));
      const state = storeRecord.State || "";
      const bookings = (bookingsByEventId[record.id] || []).map((booking) => ({
        id: booking.id,
        ambassadorName: bookingAmbassadorName(booking.fields || {}),
        confirmed: Boolean(booking.fields?.["Booking Confirmed"]),
        historyLocked: bookingHasHistory(booking.fields || {})
      }));
      return {
        id: record.id,
        name,
        eventDate,
        startTime,
        endTime,
        localStartTime: localTimePart(startTime, state),
        localEndTime: localTimePart(endTime, state),
        hourlyRate: value(f, ["Hourly Rate", "Pay Rate", "Event Pay Rate"]),
        status: value(f, ["Status"]),
        eventArea: asText(value(f, ["Event Area", "Area", "Region"])),
        portalVisible: checkboxValue(value(f, ["Portal Visible", "Publish to Portal"])),
        details: asText(value(f, ["Details", "Details / Notes", "Notes"])),
        brand: brandLookup || brandIds.map((id) => brandNameById[id]).filter(Boolean).join(", ") || safeLinkedText(value(f, ["Brand"])),
        store,
        state,
        address: asText(value(f, ["Store Address", "Address", "Full Address"])) || storeRecord.Address || "",
        dateForFilter: startTime || eventDate,
        bookings,
        bookingCount: bookings.length,
        confirmedBookingCount: bookings.filter((booking) => booking.confirmed).length,
        activeConfirmedBookingCount: bookings.filter((booking) => booking.confirmed && !booking.historyLocked).length,
        historyLockedBookingCount: bookings.filter((booking) => booking.historyLocked).length,
        hasHistoricalActivity: bookings.some((booking) => booking.historyLocked),
        ambassadorNames: bookings.map((booking) => booking.ambassadorName).filter(Boolean)
      };
    }).filter((event) => {
      if (!event.eventDate || !event.startTime || !event.endTime) return false;
      const eventDate = String(event.eventDate).slice(0, 10);
      const today = localDateForState(now, event.state);
      const isPast = eventIsPast(event, now);
      const isRecentPast = isPast && calendarDaysBetween(eventDate, today) <= days;
      if (view === "past") return isRecentPast;
      if (view === "all") return !isPast || isRecentPast;
      return !isPast;
    }).sort((a, b) => {
      if (view === "past") return dateSortValue(b) - dateSortValue(a);
      if (view === "all") {
        const aPast = eventIsPast(a, now);
        const bPast = eventIsPast(b, now);
        if (aPast !== bPast) return aPast ? 1 : -1;
        return aPast ? dateSortValue(b) - dateSortValue(a) : dateSortValue(a) - dateSortValue(b);
      }
      return dateSortValue(a) - dateSortValue(b);
    });
  }

  async function updateEventSchedule(body) {
    const { eventId, eventDate, startTime, endTime } = body;
    if (!isAirtableRecordId(eventId)) return json(400, { error: "Select a valid event." });
    const scheduleKeys = ["eventDate", "startTime", "endTime"];
    const scheduleRequested = scheduleKeys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
    if (scheduleRequested && (!isValidDateInput(eventDate) || !isValidTimeInput(startTime) || !isValidTimeInput(endTime))) {
      return json(400, { error: "Enter the event date, start time, and end time." });
    }
    if (scheduleRequested && startTime === endTime) return json(400, { error: "Start time and end time cannot be the same." });

    const eventFields = {};
    let scheduledStart = "";
    let scheduledEnd = "";
    let activeBookings = [];
    let preservedBookings = 0;
    let reconfirmationBookings = [];
    let historicalScheduleEdit = false;

    if (scheduleRequested) {
      const eventRecord = await api.airtableRequest(`${encodeURIComponent(api.TABLES.EVENTS)}/${eventId}`);
      const storeId = linkedIds(eventRecord.fields?.Store)[0];
      const storeRecord = storeId ? await api.airtableRequest(`${encodeURIComponent(api.TABLES.STORES)}/${storeId}`) : null;
      const state = storeRecord?.fields?.State || "";
      const currentDate = typeof api.now === "function" ? api.now() : new Date();
      historicalScheduleEdit = eventDate < localDateForState(currentDate, state);
      const endDate = endTime <= startTime ? addDays(eventDate, 1) : eventDate;
      scheduledStart = isoDateTimeInEventZone(eventDate, startTime, state);
      scheduledEnd = isoDateTimeInEventZone(endDate, endTime, state);
      eventFields["Event Date"] = eventDate;
      eventFields["Start Time"] = scheduledStart;
      eventFields["End Time"] = scheduledEnd;

      const bookings = await api.listRecords(api.TABLES.BOOKINGS, { maxRecords: "1000" });
      const linkedBookings = bookings.filter((record) => linkedIds(record.fields?.Event).includes(eventId));
      activeBookings = linkedBookings.filter((record) => !bookingHasHistory(record.fields || {}));
      preservedBookings = linkedBookings.length - activeBookings.length;
      reconfirmationBookings = historicalScheduleEdit
        ? []
        : activeBookings.filter((record) => Boolean(record.fields?.["Booking Confirmed"]));
    }

    if (Object.prototype.hasOwnProperty.call(body, "eventArea")) {
      const eventArea = String(body.eventArea || "").trim();
      if (!eventArea) return json(400, { error: "Select an event area." });
      eventFields["Event Area"] = eventArea;
    }
    if (Object.prototype.hasOwnProperty.call(body, "hourlyRate")) {
      const hourlyRate = Number(body.hourlyRate);
      if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) return json(400, { error: "Enter a valid hourly rate." });
      eventFields["Hourly Rate"] = String(hourlyRate);
    }
    if (Object.prototype.hasOwnProperty.call(body, "details")) eventFields.Details = String(body.details || "").trim();
    if (Object.prototype.hasOwnProperty.call(body, "portalVisible")) {
      if (typeof body.portalVisible !== "boolean") return json(400, { error: "Portal visibility must be true or false." });
      eventFields["Portal Visible"] = body.portalVisible;
    }
    if (Object.keys(eventFields).length === 0) return json(400, { error: "No event changes were provided." });

    await api.updateRecord(api.TABLES.EVENTS, eventId, eventFields);

    await Promise.all(activeBookings.map((record) => {
      const fields = {
        "Scheduled Start Snapshot": scheduledStart,
        "Scheduled End Snapshot": scheduledEnd
      };
      if (record.fields?.["Booking Confirmed"] && !historicalScheduleEdit) {
        fields["Booking Confirmed"] = false;
        fields["Booking Confirmed Email Sent"] = false;
        fields["Pay Rate Snapshot"] = null;
      }
      return api.updateRecord(api.TABLES.BOOKINGS, record.id, fields);
    }));

    return json(200, {
      eventId,
      eventDate,
      startTime: scheduledStart || null,
      endTime: scheduledEnd || null,
      updatedFields: eventFields,
      bookingsUpdated: activeBookings.length,
      bookingsPreserved: preservedBookings,
      bookingsReconfirmationRequired: reconfirmationBookings.length
    });
  }

  return async function handler(event) {
    try {
      if (event.httpMethod === "GET") {
        const query = event.queryStringParameters || {};
        return json(200, { events: await listEvents({ view: query.view, days: query.days }) }, {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
          "Netlify-CDN-Cache-Control": "no-store"
        });
      }
      if (event.httpMethod === "PATCH") {
        let body;
        try {
          body = JSON.parse(event.body || "{}");
        } catch (_error) {
          return json(400, { error: "Invalid JSON body." });
        }
        return updateEventSchedule(body);
      }
      return json(405, { error: "Method not allowed." });
    } catch (err) {
      return json(err.statusCode || 500, { error: err.message || "Event request failed." });
    }
  };
}

exports.createHandler = createHandler;
exports.bookingHasHistory = bookingHasHistory;
exports.isoDateTimeInEventZone = isoDateTimeInEventZone;
exports.localDateForState = localDateForState;
exports.handler = createHandler();
