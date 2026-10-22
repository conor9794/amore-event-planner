const test = require("node:test");
const assert = require("node:assert/strict");
const airtable = require("../netlify/functions/_airtable");

let records = [];
airtable.listRecords = async () => records;

const { handler } = require("../netlify/functions/regions");

test("returns approved and existing regions, including Wisconsin, but not proposed markets", async () => {
  records = [
    { id: "rec11111111111111", fields: { "Region Name": "Long Island", State: "NY", Status: "Existing / Review" } },
    { id: "rec22222222222222", fields: { "Region Name": "WI", State: "WI", Status: "Approved" } },
    { id: "rec33333333333333", fields: { "Region Name": "Las Vegas NV", State: "NV", Status: "Proposed" } },
    { id: "rec44444444444444", fields: { "Region Name": "Inactive market", State: "CA", Status: "Inactive" } }
  ];
  const response = await handler({ httpMethod: "GET" });
  assert.equal(response.statusCode, 200);
  const result = JSON.parse(response.body);
  assert.deepEqual(result.regions.map((x) => x.name), ["Long Island", "WI"]);
  assert.equal(result.regions[1].state, "WI");
});

test("rejects methods other than GET", async () => {
  const response = await handler({ httpMethod: "POST" });
  assert.equal(response.statusCode, 405);
});
