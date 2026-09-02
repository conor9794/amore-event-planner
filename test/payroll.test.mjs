import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../netlify/functions/payroll.mjs";

function request(method, body) {
  return new Request("https://example.test/api/payroll", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
}

test("lists actual payroll values while preserving the scheduled-hours reference", async () => {
  const handler = createHandler({
    TABLES: { BOOKINGS: "Bookings", EVENTS: "Events", BRANDS: "Brands", STORES: "Stores" },
    airtableRequest: async () => ({}),
    updateRecord: async () => ({}),
    listRecords: async (table) => {
      if (table === "Bookings") return [{
        id: "recOmXjNjckR9XGeg",
        fields: {
          Assignment: "PRELAUNCH E2E TEST",
          Event: ["recEvent123456789"],
          "Ambassador Name Text": "Brand Ambassador",
          "Pay Rate Snapshot": 30,
          "Hours Worked": 4,
          "Total Pay": 120,
          "Actual Hours Worked": 0.033333,
          "Actual Total Pay": 1
        }
      }];
      if (table === "Events") return [{
        id: "recEvent123456789",
        fields: { Brand: ["recBrand123456789"], Store: ["recStore123456789"], "Event Date": "2026-08-15" }
      }];
      if (table === "Brands") return [{ id: "recBrand123456789", fields: { "Brand Name": "Test brand" } }];
      if (table === "Stores") return [{ id: "recStore123456789", fields: { "Store Name": "Total Wine Spirits & More" } }];
      return [];
    }
  });

  const response = await handler(request("GET"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.payroll[0].payroll.scheduledHours, 4);
  assert.equal(body.payroll[0].payroll.hours, 0.033333);
  assert.equal(body.payroll[0].payroll.eventPay, 1);
  assert.equal(body.payroll[0].payroll.totalPayrollDue, 1);
  assert.equal(body.payroll[0].brand, "Test brand");
  assert.equal(body.payroll[0].store, "Total Wine Spirits & More");
});

test("marks a ready booking paid and writes the timestamp", async () => {
  let updated;
  const handler = createHandler({
    TABLES: { BOOKINGS: "Bookings", EVENTS: "Events", BRANDS: "Brands", STORES: "Stores" },
    listRecords: async () => [],
    airtableRequest: async () => ({
      fields: {
        "Ready for Payroll": true,
        "Pay Rate Snapshot": 30,
        "Hours Worked": 4,
        "Total Pay": 120
      }
    }),
    updateRecord: async (table, recordId, fields) => {
      updated = { table, recordId, fields };
      return {};
    }
  });

  const response = await handler(request("PATCH", { bookingId: "recOmXjNjckR9XGeg" }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.totalPay, 120);
  assert.equal(updated.table, "Bookings");
  assert.equal(updated.recordId, "recOmXjNjckR9XGeg");
  assert.equal(updated.fields.Paid, true);
  assert.match(updated.fields["Paid Timestamp"], /^\d{4}-\d{2}-\d{2}T/);
});

test("rejects a booking that is not ready for payroll", async () => {
  let updateCalled = false;
  const handler = createHandler({
    TABLES: { BOOKINGS: "Bookings", EVENTS: "Events", BRANDS: "Brands", STORES: "Stores" },
    listRecords: async () => [],
    airtableRequest: async () => ({ fields: { "Ready for Payroll": false } }),
    updateRecord: async () => {
      updateCalled = true;
    }
  });

  const response = await handler(request("PATCH", { bookingId: "recOmXjNjckR9XGeg" }));

  assert.equal(response.status, 409);
  assert.equal(updateCalled, false);
});
