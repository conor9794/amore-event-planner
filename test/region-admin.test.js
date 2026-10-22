"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const salt = "0123456789abcdef0123456789abcdef";
const password = "testing-planner-password-2026";
const hash = crypto.scryptSync(password, Buffer.from(salt,"hex"), 32,{N:16384,r:8,p:1}).toString("hex");
process.env.PLANNER_AUTH_USERS = JSON.stringify(Object.fromEntries(["conor9794@gmail.com","melinda@amorestaffing.com","tommaguire2323@gmail.com"].map(email=>[email,{salt,hash}])));
process.env.PLANNER_SESSION_SECRET = "test-region-management-planner-session-signing-key-2026";
const { issue } = require("../netlify/functions/_planner-auth");
const airtable = require("../netlify/functions/_airtable");
const token = issue("conor9794@gmail.com");
let records = [], creates = [];
airtable.listRecords = async () => records;
airtable.createRecord = async (_table, fields) => {
  creates.push(fields);
  return { id: "rec00000000000001" };
};
const { handler } = require("../netlify/functions/region-admin");
const request = (body, authorized = true) => ({
  httpMethod:"POST",
  headers: authorized ? { cookie: "amore_planner_session="+token } : {},
  body: JSON.stringify(body)
});
test("rejects writes without a valid planner session", async () => {
  creates = [];
  assert.equal((await handler(request({name:"Milwaukee WI",state:"WI"},false))).statusCode,401);
  assert.equal(creates.length,0);
});
test("rejects invalid names or state abbreviations", async () => {
  assert.equal((await handler(request({name:"x",state:"WI"}))).statusCode,400);
  assert.equal((await handler(request({name:"Madison WI",state:"XX"}))).statusCode,400);
});
test("refuses duplicate regions", async () => {
  records = [{id:"rec00000000000002",fields:{"Region Name":"Milwaukee WI","State":"WI","Status":"Proposed"}}];
  creates=[];
  assert.equal((await handler(request({name:"milwaukee wi",state:"WI"}))).statusCode,409);
  assert.equal(creates.length,0);
});
test("creates approved region for a signed-in operator", async () => {
  records=[]; creates=[];
  const r=await handler(request({name:"Milwaukee WI",state:"WI"}));
  assert.equal(r.statusCode,201);
  assert.equal(creates.length,1);
  assert.equal(creates[0].Status,"Approved");
});
