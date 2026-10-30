"use strict";
const crypto = require("node:crypto");
const { airtableRequest } = require("./_airtable");
const TABLE = "tblH3zz76C9mEOu4R";
const APPROVED = ["conor9794@gmail.com", "melinda@amorestaffing.com", "tommaguire2323@gmail.com"];
function emailForKey(key) {
  for (const email of APPROVED) {
    if (key === "reset/" + crypto.createHash("sha256").update(email).digest("hex")) return email;
  }
  throw Error("Invalid operator reset key.");
}
async function lookup(email) {
  const url = new URL("https://api.airtable.com/v0/" +
    encodeURIComponent(process.env.AIRTABLE_BASE_ID || "appqulbpEb4AWfb75") + "/" + TABLE);
  url.searchParams.set("filterByFormula", "{Operator Email} = " + JSON.stringify(email));
  url.searchParams.set("maxRecords", "2");
  const result = await airtableRequest(url.toString());
  const records = result.records || [];
  if (records.length > 1) throw Error("Duplicate operator credential records.");
  return records[0] || null;
}
function decode(row) {
  if (!row || !row.fields?.["Reset Token Digest"]) return null;
  const f = row.fields;
  return {
    digest: f["Reset Token Digest"],
    requestedAt: Number(f["Reset Requested At"] || 0),
    expiresAt: Number(f["Reset Expires At"] || 0),
    used: Boolean(f["Reset Used At"])
  };
}
function etag(row) {
  if (!row) return null;
  const f = row.fields || {};
  return crypto.createHash("sha256").update(
    [f["Reset Token Digest"] || "", f["Reset Requested At"] || "", f["Reset Used At"] || ""].join("|")
  ).digest("hex");
}
function resetFields(data) {
  return {
    "Reset Token Digest": data.digest || null,
    "Reset Requested At": data.requestedAt ? String(data.requestedAt) : null,
    "Reset Expires At": data.expiresAt ? String(data.expiresAt) : null,
    "Reset Used At": data.used ? new Date().toISOString() : null
  };
}
async function write(email, row, data) {
  const fields = resetFields(data);
  if (row) {
    await airtableRequest(TABLE + "/" + row.id, { method: "PATCH", body: JSON.stringify({ fields }) });
  } else {
    await airtableRequest(TABLE, { method: "POST", body: JSON.stringify({ fields: { "Operator Email": email, ...fields } }) });
  }
}
function getStore() {
  return {
    async get(key) { return decode(await lookup(emailForKey(key))); },
    async getWithMetadata(key) {
      const row = await lookup(emailForKey(key));
      if (!row || !decode(row)) return null;
      return { data: decode(row), etag: etag(row) };
    },
    async setJSON(key, data, options = {}) {
      const email = emailForKey(key), row = await lookup(email);
      if (options.onlyIfMatch && (!row || etag(row) !== options.onlyIfMatch)) return { modified: false };
      await write(email, row, data);
      return { modified: true };
    },
    async delete(key) {
      const email = emailForKey(key), row = await lookup(email);
      if (row) await write(email, row, {});
    }
  };
}
module.exports = { getStore };
