const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const payrollPath = path.resolve(__dirname, "../netlify/functions/payroll.js");

function loadPayroll(mockAirtable) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "./_airtable" && parent?.filename === payrollPath) return mockAirtable;
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[payrollPath];
  try {
    return require(payrollPath);
  } finally {
    Module._load = originalLoad;
  }
}

test("lists only scheduled payroll values", async () => {
  const module = loadPayroll({
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

  const response = await module.handler({ httpMethod: "GET" });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.payroll[0].payroll.scheduledHours, 4);
  assert.equal(body.payroll[0].payroll.totalPay, 120);
});

test("marks a ready booking paid and writes the timestamp", async () => {
  let updated;
  const module = loadPayroll({
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

  const response = await module.handler({
    httpMethod: "PATCH",
    body: JSON.stringify({ bookingId: "recOmXjNjckR9XGeg" })
  });
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.totalPay, 120);
  assert.equal(updated.table, "Bookings");
  assert.equal(updated.recordId, "recOmXjNjckR9XGeg");
  assert.equal(updated.fields.Paid, true);
  assert.match(updated.fields["Paid Timestamp"], /^\d{4}-\d{2}-\d{2}T/);
});

test("rejects a booking that is not ready for payroll", async () => {
  let updateCalled = false;
  const module = loadPayroll({
    TABLES: { BOOKINGS: "Bookings" },
    listRecords: async () => [],
    airtableRequest: async () => ({ fields: { "Ready for Payroll": false } }),
    updateRecord: async () => {
      updateCalled = true;
    }
  });

  const response = await module.handler({
    httpMethod: "PATCH",
    body: JSON.stringify({ bookingId: "recOmXjNjckR9XGeg" })
  });

  assert.equal(response.statusCode, 409);
  assert.equal(updateCalled, false);
});
