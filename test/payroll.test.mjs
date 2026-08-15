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

test("lists only scheduled payroll values", async () => {
  const handler = createHandler({
    TABLES: { BOOKINGS: "Bookings" },
    airtableRequest: async () => ({}),
    updateRecord: async () => ({}),
    listRecords: async () => [{
      id: "recOmXjNjckR9XGeg",
      fields: {
        Assignment: "PRELAUNCH E2E TEST",
        "Ambassador Name Text": "Brand Ambassador",
        "Pay Rate Snapshot": 30,
        "Hours Worked": 4,
        "Total Pay": 120,
        "Actual Hours Worked": 0.033333,
        "Actual Total Pay": 1
      }
    }]
  });

  const response = await handler(request("GET"));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.payroll[0].payroll.scheduledHours, 4);
  assert.equal(body.payroll[0].payroll.totalPay, 120);
});

test("marks a ready booking paid and writes the timestamp", async () => {
  let updated;
  const handler = createHandler({
    TABLES: { BOOKINGS: "Bookings" },
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
    TABLES: { BOOKINGS: "Bookings" },
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
