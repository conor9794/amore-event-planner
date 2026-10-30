"use strict";
const crypto = require("node:crypto");
const { airtableRequest } = require("./_airtable");
const TABLE = "tblH3zz76C9mEOu4R";

// The Amore planner already uses this Airtable API connection for scheduling.
// Use a private, separate credentials table so operator logins don't depend on
// the Netlify Blobs runtime. Only salted password hashes are persisted.
let provider = () => ({
  async get(email) {
    const formula = "{Operator Email} = " + JSON.stringify(email);
    const url = new URL("https://api.airtable.com/v0/" +
      encodeURIComponent(process.env.AIRTABLE_BASE_ID || "appqulbpEb4AWfb75") + "/" + TABLE);
    url.searchParams.set("filterByFormula", formula);
    url.searchParams.set("maxRecords", "2");
    const data = await airtableRequest(url.toString());
    const records = data.records || [];
    if (records.length > 1) throw Error("Duplicate operator credentials.");
    if (!records.length) return null;
    const fields = records[0].fields || {};
    return { id: records[0].id, salt: fields["Password Salt"], hash: fields["Password Hash"] };
  },
  async set(email, value) {
    const existing = await this.get(email);
    const fields = {
      "Operator Email": email,
      "Password Salt": value.salt,
      "Password Hash": value.hash,
      "Password Updated At": new Date().toISOString()
    };
    if (existing) {
      await airtableRequest(TABLE + "/" + existing.id, { method: "PATCH", body: JSON.stringify({ fields }) });
    } else {
      await airtableRequest(TABLE, { method: "POST", body: JSON.stringify({ fields }) });
    }
  }
});
function assertCredential(value) {
  if (!value || !/^[a-f0-9]{32}$/.test(value.salt || "") || !/^[a-f0-9]{64}$/.test(value.hash || ""))
    throw Error("Stored credential is invalid.");
}
async function get(email) {
  const value = await provider().get(email);
  if (value === null) return null;
  assertCredential(value);
  return value;
}
async function set(email, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, Buffer.from(salt, "hex"), 32, { N: 16384, r: 8, p: 1 }).toString("hex");
  await provider().set(email, { salt, hash });
}
function __setProviderForTests(factory) { provider = factory; }
module.exports = { get, set, __setProviderForTests };
