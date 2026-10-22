"use strict";
const { timingSafeEqual } = require("node:crypto");
const { listRecords, createRecord } = require("./_airtable");
const REGIONS_TABLE = process.env.AIRTABLE_REGIONS_TABLE || "tblBzNsZBH3stZwiJ";
const STATE_CODES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(data)
  };
}

function authorized(event) {
  // Fail closed if the environment variable has not been set or is too weak.
  const expected = process.env.REGION_ADMIN_PASSWORD || "";
  if (expected.length < 24) return null;
  const headers = event.headers || {};
  const supplied = String(headers["x-region-admin-password"] || headers["X-Region-Admin-Password"] || "");
  if (supplied.length < 1 || supplied.length > 512) return false;
  const a = Buffer.from(supplied, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Invalid request.";
  const name = typeof body.name === "string" ? body.name.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
  const state = typeof body.state === "string" ? body.state.trim().toUpperCase() : "";
  if (name.length < 2 || name.length > 80 || /[<>\r\n\t]/.test(name)) return "Enter a region name between 2 and 80 characters.";
  if (!STATE_CODES.has(state)) return "Select a valid US state or DC.";
  return { name, state };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  const access = authorized(event);
  if (access === null) return json(503, { error: "Region management is not configured yet. Ask the administrator to set REGION_ADMIN_PASSWORD in Netlify Functions settings and redeploy." });
  if (!access) return json(401, { error: "Incorrect management password." });
  if (String(event.body || "").length > 2000) return json(413, { error: "Request is too large." });

  let input;
  try { input = validate(JSON.parse(event.body || "{}")); }
  catch (_) { return json(400, { error: "Invalid JSON request." }); }
  if (typeof input === "string") return json(400, { error: input });

  try {
    const records = await listRecords(REGIONS_TABLE, { "fields[]": ["Region Name", "State", "Status"] });
    const existing = records.find((record) => String(record.fields?.["Region Name"] || "").trim().toLowerCase() === input.name.toLowerCase());
    if (existing) return json(409, { error: "That region name already exists. Review the existing record instead." });

    const result = await createRecord(REGIONS_TABLE, {
      "Region Name": input.name,
      "State": input.state,
      "Status": "Approved",
      "Source": "Melinda Request",
      "Notes": "Created through Event Planner region management."
    });
    return json(201, { region: { id: result.id, name: input.name, state: input.state, status: "Approved" } });
  } catch (err) {
    console.error("Region creation failed", err);
    return json(502, { error: "The region could not be saved. No changes were made to existing events." });
  }
};
