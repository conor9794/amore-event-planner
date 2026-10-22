"use strict";
const crypto = require("node:crypto");
const COOKIE_NAME = "amore_planner_session";
const TTL_SECONDS = 8 * 60 * 60;
function secret() {
  const s = process.env.PLANNER_SESSION_SECRET || "";
  if (s.length < 48) throw Error("Planner session signing secret is not configured.");
  return s;
}
function accounts() {
  const val = process.env.PLANNER_AUTH_USERS;
  if (!val) throw Error("Planner accounts are not configured.");
  let users;
  try { users = JSON.parse(val); } catch (_) { throw Error("Planner account configuration is invalid."); }
  if (!users || typeof users !== "object" || Array.isArray(users)) throw Error("Planner account configuration is invalid.");
  // At launch, precisely the three owners/administrators are allowed.
  const approved = ["conor9794@gmail.com","melinda@amorestaffing.com","tommaguire2323@gmail.com"];
  if (Object.keys(users).length !== 3 || approved.some(email => !users[email])) throw Error("Planner account allowlist does not match approved operators.");
  return users;
}
function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}
function issue(email) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const encoded = Buffer.from(JSON.stringify({ v: 1, email, exp })).toString("base64url");
  return encoded + "." + sign(encoded);
}
function parseCookies(value) {
  const match = String(value || "").split(";").map(p => p.trim()).find(p => p.startsWith(COOKIE_NAME + "="));
  return match ? match.slice(COOKIE_NAME.length + 1) : "";
}
function verify(headers = {}) {
  const cookie = headers.cookie || headers.Cookie || "";
  const token = parseCookies(cookie);
  if (!token || token.length > 4000) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return null;
  let value;
  try { value = JSON.parse(Buffer.from(encoded,"base64url").toString("utf8")); } catch (_) { return null; }
  if (value.v !== 1 || typeof value.email !== "string" || !Number.isFinite(value.exp) || Math.floor(Date.now()/1000) >= value.exp) return null;
  if (!Object.hasOwn(accounts(), value.email)) return null;
  return value;
}
function secureCookie(token, maxAge) {
  return COOKIE_NAME + "=" + token + "; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=" + maxAge;
}
function authenticate(email, password) {
  const users = accounts();
  const normalized = String(email || "").trim().toLowerCase();
  const pw = typeof password === "string" ? password : "";
  if (!users[normalized] || !pw || pw.length > 200) return null;
  const { salt, hash } = users[normalized];
  if (!/^[a-f0-9]{32}$/.test(String(salt)) || !/^[a-f0-9]{64}$/.test(String(hash))) throw Error("Invalid account hash configuration.");
  const computed = crypto.scryptSync(pw, Buffer.from(salt, "hex"), 32, { N: 16384, r: 8, p: 1 });
  const original = Buffer.from(hash, "hex");
  return crypto.timingSafeEqual(computed, original) ? normalized : null;
}
function configured() {
  try { secret(); accounts(); return true; } catch (_) { return false; }
}
module.exports = { COOKIE_NAME, secureCookie, authenticate, issue, verify, configured, accounts };
