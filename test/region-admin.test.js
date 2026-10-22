"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const airtable = require("../netlify/functions/_airtable");
const secret = "example-long-password-32-chars!";
process.env.REGION_ADMIN_PASSWORD = secret;

let records = [];
let creates = [];
airtable.listRecords = async () => records;
airtable.createRecord = async (_table, fields) => {
  creates.push(fields);
  return { id: "rec00000000000001" };
};
const { handler } = require("../netlify/functions/region-admin");

const request = (body, password = secret) => ({
  httpMethod: "POST",
  headers: { "x-region-admin-password": password },
  body: JSON.stringify(body)
});

test("rejects requests without the correct password", async () => {
  creates = [];
  const res = await handler(request({ name: "Milwaukee WI", state: "WI" }, "incorrect"));
  assert.equal(res.statusCode, 401);
  assert.equal(creates.length, 0);
});

test("rejects bad state codes and invalid names", async () => {
  assert.equal((await handler(request({ name: "x", state: "WI" }))).statusCode, 400);
  assert.equal((await handler(request({ name: "Milwaukee WI", state: "XX" }))).statusCode, 400);
});

test("prevents duplicate regions", async () => {
  records = [{ id: "rec00000000000002", fields: { "Region Name": "Milwaukee WI", State: "WI", Status: "Proposed" } }];
  creates = [];
  const res = await handler(request({ name: "milwaukee wi", state: "WI" }));
  assert.equal(res.statusCode, 409);
  assert.equal(creates.length, 0);
});

test("creates approved region for authorized manager", async () => {
  records = [];
  creates = [];
  const res = await handler(request({ name: "Milwaukee WI", state: "WI" }));
  assert.equal(res.statusCode, 201);
  assert.equal(creates.length, 1);
  assert.equal(creates[0].Status, "Approved");
  assert.equal(creates[0].State, "WI");
});

test("requires server configuration before writes", async () => {
  const before = process.env.REGION_ADMIN_PASSWORD;
  delete process.env.REGION_ADMIN_PASSWORD;
  try { assert.equal((await handler(request({ name: "Madison WI", state: "WI" }))).statusCode, 503); }
  finally { process.env.REGION_ADMIN_PASSWORD = before; }
});
