"use strict";
const crypto = require("node:crypto");
// Site-wide, strong-consistency store: a password changed in preview must remain
// active when the same site is promoted to production. Never seed test credentials here.
let provider = () => require("@netlify/blobs").getStore({ name: "amore-planner-operator-credentials-v1", consistency: "strong" });
function key(email) { return "operator/" + crypto.createHash("sha256").update(email).digest("hex"); }
async function get(email) {
  const value = await provider().get(key(email), { type: "json", consistency: "strong" });
  if (value === null) return null;
  if (!value || !/^[a-f0-9]{32}$/.test(value.salt || "") || !/^[a-f0-9]{64}$/.test(value.hash || "")) {
    throw Error("Stored credential is invalid.");
  }
  return value;
}
async function set(email, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, Buffer.from(salt, "hex"), 32, { N: 16384, r: 8, p: 1 }).toString("hex");
  await provider().setJSON(key(email), { salt, hash, updatedAt: Date.now() });
}
function __setProviderForTests(factory) { provider = factory; }
module.exports = { get, set, __setProviderForTests };
