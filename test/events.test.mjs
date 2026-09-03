import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createHandler, isoDateTimeInEventZone, bookingHasHistory } = require("../netlify/functions/events.js");
const staffBookings = require("../netlify/functions/staff-bookings.js");

const TABLES = {
  EVENTS: "Events",
  STORES: "Stores",
  BOOKINGS: "Bookings",
  BRANDS: "Brands"
};

test("event-zone conversion handles daylight time", () => {
  assert.equal(isoDateTimeInEventZone("2026-09-12", "18:00", "NY"), "2026-09-12T22:00:00.000Z");
});

test("booking history lock covers attendance, recaps, and payroll", () => {
  assert.equal(bookingHasHistory({}), false);
  assert.equal(bookingHasHistory({ "Clock In Timestamp": "2026-09-12T22:01:00Z" }), true);
  assert.equal(bookingHasHistory({ "Recap Submitted Timestamp": "2026-09-13T02:00:00Z" }), true);
  assert.equal(bookingHasHistory({ "Ready for Payroll": true }), true);
  assert.equal(bookingHasHistory({ Paid: true }), true);
  assert.throws(
    () => staffBookings.assertBookingCanChange({ fields: { "Clock Out Timestamp": "2026-09-13T02:00:00Z" } }),
    /cannot be changed from the planner/
  );
});

test("past staff corrections preserve confirmation and pay-rate fields", () => {
  assert.deepEqual(staffBookings.staffChangeFields("recAMBASSADORABC", true), {
    Ambassador: ["recAMBASSADORABC"]
  });
  assert.deepEqual(staffBookings.staffChangeFields("recAMBASSADORABC", false), {
    Ambassador: ["recAMBASSADORABC"],
    "Booking Confirmed": false,
    "Booking Confirmed Email Sent": false,
    "Pay Rate Snapshot": null,
    "Send Save the Date": false,
    "Save the Date Sent": false
  });
});

test("schedule edit updates the event and active booking snapshots while preserving history", async () => {
  const updates = [];
  const handler = createHandler({
    TABLES,
    airtableRequest: async (path) => {
      if (path === "Events/recABCDEFGHIJKLMN") return { id: "recABCDEFGHIJKLMN", fields: { Store: ["recSTOREABCDEFGHIJ"] } };
      if (path === "Stores/recSTOREABCDEFGHIJ") return { id: "recSTOREABCDEFGHIJ", fields: { State: "NY" } };
      throw new Error(`Unexpected Airtable path: ${path}`);
    },
    listRecords: async (table) => {
      assert.equal(table, "Bookings");
      return [
        { id: "recACTIVEABCDEFG", fields: { Event: ["recABCDEFGHIJKLMN"] } },
        { id: "recCONFIRMEDABCDE", fields: { Event: ["recABCDEFGHIJKLMN"], "Booking Confirmed": true, "Pay Rate Snapshot": 30 } },
        { id: "recLOCKEDABCDEFG", fields: { Event: ["recABCDEFGHIJKLMN"], "Recap Submitted Timestamp": "2026-09-13T02:00:00Z" } }
      ];
    },
    updateRecord: async (table, id, fields) => {
      updates.push({ table, id, fields });
      return { id, fields };
    }
  });

  const response = await handler({
    httpMethod: "PATCH",
    body: JSON.stringify({ eventId: "recABCDEFGHIJKLMN", eventDate: "2026-09-12", startTime: "18:00", endTime: "01:00" })
  });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.bookingsUpdated, 2);
  assert.equal(body.bookingsPreserved, 1);
  assert.equal(body.bookingsReconfirmationRequired, 1);
  assert.equal(body.startTime, "2026-09-12T22:00:00.000Z");
  assert.equal(body.endTime, "2026-09-13T05:00:00.000Z");
  assert.deepEqual(updates, [
    {
      table: "Events",
      id: "recABCDEFGHIJKLMN",
      fields: {
        "Event Date": "2026-09-12",
        "Start Time": "2026-09-12T22:00:00.000Z",
        "End Time": "2026-09-13T05:00:00.000Z"
      }
    },
    {
      table: "Bookings",
      id: "recACTIVEABCDEFG",
      fields: {
        "Scheduled Start Snapshot": "2026-09-12T22:00:00.000Z",
        "Scheduled End Snapshot": "2026-09-13T05:00:00.000Z"
      }
    },
    {
      table: "Bookings",
      id: "recCONFIRMEDABCDE",
      fields: {
        "Scheduled Start Snapshot": "2026-09-12T22:00:00.000Z",
        "Scheduled End Snapshot": "2026-09-13T05:00:00.000Z",
        "Booking Confirmed": false,
        "Booking Confirmed Email Sent": false,
        "Pay Rate Snapshot": null
      }
    }
  ]);
});

test("schedule edit rejects equal start and end times", async () => {
  const handler = createHandler({ TABLES });
  const response = await handler({
    httpMethod: "PATCH",
    body: JSON.stringify({ eventId: "recABCDEFGHIJKLMN", eventDate: "2026-09-12", startTime: "18:00", endTime: "18:00" })
  });
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /cannot be the same/);
});

test("schedule edit rejects impossible dates, times, and malformed JSON", async () => {
  const handler = createHandler({ TABLES });
  const invalidDate = await handler({
    httpMethod: "PATCH",
    body: JSON.stringify({ eventId: "recABCDEFGHIJKLMN", eventDate: "2026-02-30", startTime: "18:00", endTime: "20:00" })
  });
  const invalidTime = await handler({
    httpMethod: "PATCH",
    body: JSON.stringify({ eventId: "recABCDEFGHIJKLMN", eventDate: "2026-09-12", startTime: "25:00", endTime: "20:00" })
  });
  const malformed = await handler({ httpMethod: "PATCH", body: "{" });
  assert.equal(invalidDate.statusCode, 400);
  assert.equal(invalidTime.statusCode, 400);
  assert.equal(malformed.statusCode, 400);
  assert.match(JSON.parse(malformed.body).error, /Invalid JSON/);
});

test("event list responses explicitly bypass browser and CDN caches", async () => {
  const handler = createHandler({
    TABLES,
    listRecords: async () => []
  });
  const response = await handler({ httpMethod: "GET" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "no-store, max-age=0, must-revalidate");
  assert.equal(response.headers["Netlify-CDN-Cache-Control"], "no-store");
});

test("event views separate upcoming events from the previous 90 days using each event's local date", async () => {
  const events = [
    { id: "future", fields: { "Event Name": "Future", "Event Date": "2026-09-10", "Start Time": "2026-09-10T14:00:00Z", "End Time": "2026-09-10T16:00:00Z", Store: ["ny"] } },
    { id: "todayLocal", fields: { "Event Name": "Still Today in New York", "Event Date": "2026-09-02", "Start Time": "2026-09-03T01:00:00Z", "End Time": "2026-09-03T02:00:00Z", Store: ["ny"] } },
    { id: "recent", fields: { "Event Name": "Recent", "Event Date": "2026-09-01", "Start Time": "2026-09-01T14:00:00Z", "End Time": "2026-09-01T16:00:00Z", Store: ["ny"] } },
    { id: "olderRecent", fields: { "Event Name": "Older Recent", "Event Date": "2026-08-01", "Start Time": "2026-08-01T14:00:00Z", "End Time": "2026-08-01T16:00:00Z", Store: ["ny"] } },
    { id: "tooOld", fields: { "Event Name": "Too Old", "Event Date": "2026-05-01", "Start Time": "2026-05-01T14:00:00Z", "End Time": "2026-05-01T16:00:00Z", Store: ["ny"] } }
  ];
  const handler = createHandler({
    TABLES,
    now: () => new Date("2026-09-03T02:00:00Z"),
    listRecords: async (table) => {
      if (table === TABLES.EVENTS) return events;
      if (table === TABLES.STORES) return [{ id: "ny", fields: { State: "NY" } }];
      return [];
    }
  });

  const upcoming = JSON.parse((await handler({ httpMethod: "GET" })).body).events;
  const past = JSON.parse((await handler({ httpMethod: "GET", queryStringParameters: { view: "past", days: "90" } })).body).events;
  const all = JSON.parse((await handler({ httpMethod: "GET", queryStringParameters: { view: "all", days: "90" } })).body).events;

  assert.deepEqual(upcoming.map((event) => event.id), ["todayLocal", "future"]);
  assert.deepEqual(past.map((event) => event.id), ["recent", "olderRecent"]);
  assert.deepEqual(all.map((event) => event.id), ["olderRecent", "recent", "todayLocal", "future"]);
});

test("event list includes desktop staffing and editing details", async () => {
  const handler = createHandler({
    TABLES,
    listRecords: async (table) => {
      if (table === TABLES.EVENTS) return [{
        id: "recABCDEFGHIJKLMN",
        fields: {
          "Event Name": "Harvest Tasting @ Market",
          "Event Date": "2099-09-12",
          "Start Time": "2099-09-12T22:00:00.000Z",
          "End Time": "2099-09-13T01:00:00.000Z",
          "Event Area": "NYC",
          "Portal Visible": true,
          Details: "Bring tablecloth",
          Store: ["recSTOREABCDEFGHIJ"],
          Brand: ["recBRANDABCDEFGHIJ"]
        }
      }];
      if (table === TABLES.STORES) return [{ id: "recSTOREABCDEFGHIJ", fields: { "Store Name": "Market", State: "NY", Address: "1 Main St" } }];
      if (table === TABLES.BRANDS) return [{ id: "recBRANDABCDEFGHIJ", fields: { "Brand Name": "Harvest" } }];
      if (table === TABLES.BOOKINGS) return [
        { id: "recBOOKINGABCDEF", fields: { Event: ["recABCDEFGHIJKLMN"], "Ambassador Name Text": "Alex Rivera", "Booking Confirmed": true } },
        { id: "recBOOKINGGHIJKL", fields: { Event: ["recABCDEFGHIJKLMN"], Assignment: "Harvest — Sam Lee", "Recap Approved": true } }
      ];
      throw new Error(`Unexpected table: ${table}`);
    }
  });

  const response = await handler({ httpMethod: "GET" });
  const [event] = JSON.parse(response.body).events;
  assert.equal(response.statusCode, 200);
  assert.equal(event.eventArea, "NYC");
  assert.equal(event.portalVisible, true);
  assert.equal(event.details, "Bring tablecloth");
  assert.equal(event.bookingCount, 2);
  assert.equal(event.confirmedBookingCount, 1);
  assert.equal(event.activeConfirmedBookingCount, 1);
  assert.equal(event.historyLockedBookingCount, 1);
  assert.equal(event.hasHistoricalActivity, true);
  assert.deepEqual(event.ambassadorNames, ["Alex Rivera", "Sam Lee"]);
});

test("past schedule corrections keep active booking confirmation while preserving locked history", async () => {
  const updates = [];
  const handler = createHandler({
    TABLES,
    now: () => new Date("2026-09-20T12:00:00Z"),
    airtableRequest: async (path) => path.startsWith("Events/")
      ? { fields: { Store: ["recSTOREABCDEFGHIJ"] } }
      : { fields: { State: "NY" } },
    listRecords: async () => [
      { id: "recCONFIRMEDABCDE", fields: { Event: ["recABCDEFGHIJKLMN"], "Booking Confirmed": true, "Pay Rate Snapshot": 30 } },
      { id: "recLOCKEDABCDEFG", fields: { Event: ["recABCDEFGHIJKLMN"], "Ready for Payroll": true } }
    ],
    updateRecord: async (table, id, fields) => {
      updates.push({ table, id, fields });
      return { id, fields };
    }
  });
  const response = await handler({
    httpMethod: "PATCH",
    body: JSON.stringify({ eventId: "recABCDEFGHIJKLMN", eventDate: "2026-09-12", startTime: "18:30", endTime: "21:00" })
  });
  const body = JSON.parse(response.body);
  const bookingUpdate = updates.find((update) => update.id === "recCONFIRMEDABCDE");

  assert.equal(response.statusCode, 200);
  assert.equal(body.bookingsReconfirmationRequired, 0);
  assert.equal(body.bookingsPreserved, 1);
  assert.equal(bookingUpdate.fields["Booking Confirmed"], undefined);
  assert.equal(bookingUpdate.fields["Pay Rate Snapshot"], undefined);
});

test("non-schedule desktop edit only updates the event fields", async () => {
  const updates = [];
  const handler = createHandler({
    TABLES,
    airtableRequest: async () => { throw new Error("Airtable reads are not needed for a non-schedule edit"); },
    listRecords: async () => { throw new Error("Booking reads are not needed for a non-schedule edit"); },
    updateRecord: async (table, id, fields) => {
      updates.push({ table, id, fields });
      return { id, fields };
    }
  });
  const response = await handler({
    httpMethod: "PATCH",
    body: JSON.stringify({
      eventId: "recABCDEFGHIJKLMN",
      eventArea: "NJ",
      hourlyRate: "32.50",
      details: "Updated instructions",
      portalVisible: false
    })
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(updates, [{
    table: "Events",
    id: "recABCDEFGHIJKLMN",
    fields: { "Event Area": "NJ", "Hourly Rate": "32.5", Details: "Updated instructions", "Portal Visible": false }
  }]);
});

test("desktop edit validates visibility and rejects empty changes", async () => {
  const handler = createHandler({ TABLES });
  const invalidVisibility = await handler({
    httpMethod: "PATCH",
    body: JSON.stringify({ eventId: "recABCDEFGHIJKLMN", portalVisible: "false" })
  });
  const empty = await handler({
    httpMethod: "PATCH",
    body: JSON.stringify({ eventId: "recABCDEFGHIJKLMN" })
  });
  assert.equal(invalidVisibility.statusCode, 400);
  assert.match(JSON.parse(invalidVisibility.body).error, /true or false/);
  assert.equal(empty.statusCode, 400);
  assert.match(JSON.parse(empty.body).error, /No event changes/);
});
