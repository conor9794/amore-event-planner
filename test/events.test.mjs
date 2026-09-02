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
  assert.equal(body.bookingsUpdated, 1);
  assert.equal(body.bookingsPreserved, 1);
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
    }
  ]);
});
