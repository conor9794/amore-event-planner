"use strict";
const crypto = require("node:crypto");
const { connectLambda } = require("@netlify/blobs");
const { verify, accounts, authenticate, secureCookie } = require("./_planner-auth");
const credentials = require("./_planner-credentials");

let resetStoreProvider = () => require("@netlify/blobs").getStore({ name: "amore-planner-operator-reset-v1", consistency: "strong" });
const TTL_MS = 15 * 60 * 1000;
const COOLDOWN_MS = 90 * 1000;
function key(email) { return "reset/" + crypto.createHash("sha256").update(email).digest("hex"); }
function digest(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
function safeEqual(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function json(statusCode, body, clearCookie = false) {
  return { statusCode, headers: {
    "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    ...(clearCookie ? { "Set-Cookie": secureCookie("", 0) } : {})
  }, body: JSON.stringify(body) };
}
function normalize(email) { return String(email || "").trim().toLowerCase(); }
function validatePassword(password) {
  return typeof password === "string" && password.length >= 14 && password.length <= 128 &&
    !/[\u0000-\u001f\u007f]/.test(password);
}
function requestHost(event) {
  const raw = String(event.headers?.host || event.headers?.Host || "").toLowerCase();
  if (raw === "planner.amorestaffing.com" || raw === "deploy-preview-12--amore-event-planner.netlify.app") return raw;
  return null;
}
async function sendReset(email, token, host) {
  const api = process.env.RESEND_API_KEY || "";
  const from = process.env.PLANNER_RESET_FROM_EMAIL || "";
  if (!api || !from) throw Error("Reset email delivery has not been configured.");
  const url = "https://" + host + "/reset-password.html?email=" + encodeURIComponent(email) + "&token=" + encodeURIComponent(token);
  const body = {
    from, to: [email], subject: "Reset your Amore Event Planner password",
    text: "We received a request to reset your Amore Event Planner password. Open this link within 15 minutes:\n\n" +
      url + "\n\nIf you did not request a reset, ignore this message. Your existing password will continue working."
  };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { "Authorization": "Bearer " + api, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw Error("Reset email provider returned HTTP " + res.status);
}
async function requestReset(email, event) {
  // Never reveal whether an email is allowlisted.
  const success = json(200, { ok: true, message: "If this email is approved, a reset link will be sent." });
  const host = requestHost(event);
  if (!host) return json(400, { error: "Unsupported application host." });
  if (!process.env.RESEND_API_KEY || !process.env.PLANNER_RESET_FROM_EMAIL)
    return json(503, { error: "Email recovery is not enabled yet. Sign in using your temporary password and select Change Password." });
  if (!Object.hasOwn(accounts(), email)) return success;
  const store = resetStoreProvider(), k = key(email);
  const prior = await store.get(k, { type: "json", consistency: "strong" });
  if (prior && Date.now() - Number(prior.requestedAt || 0) < COOLDOWN_MS) return success;
  const token = crypto.randomBytes(32).toString("hex");
  await store.setJSON(k, { digest: digest(token), requestedAt: Date.now(), expiresAt: Date.now() + TTL_MS, used: false });
  try { await sendReset(email, token, host); }
  catch (e) {
    await store.delete(k);
    console.error("Reset email delivery failed:", e.message);
    return json(503, { error: "Reset email could not be delivered. Contact the administrator." });
  }
  return success;
}
async function resetPassword(email, token, password) {
  if (!Object.hasOwn(accounts(), email) || !/^[a-f0-9]{64}$/.test(String(token)) || !validatePassword(password))
    return json(400, { error: "Invalid reset request or password. Use at least 14 characters." });
  const store = resetStoreProvider(), k = key(email);
  const entry = await store.getWithMetadata(k, { type: "json", consistency: "strong" });
  const data = entry?.data;
  if (!data || data.used || Date.now() >= data.expiresAt || !safeEqual(data.digest, digest(token)))
    return json(401, { error: "Reset link is invalid, expired, or already used." });
  // Claim the one-use token atomically before changing the password.
  const claimed = await store.setJSON(k, { ...data, used: true }, { onlyIfMatch: entry.etag });
  if (!claimed.modified) return json(401, { error: "Reset link has already been used." });
  await credentials.set(email, password);
  return json(200, { ok: true, message: "Password updated. Please sign in with your new password." }, true);
}
async function changePassword(event, currentPassword, password) {
  const session = verify(event.headers || {});
  if (!session) return json(401, { error: "Sign in again before changing your password." });
  if (!validatePassword(password)) return json(400, { error: "Your new password must contain 14–128 characters." });
  if (!(await authenticate(session.email, currentPassword)))
    return json(401, { error: "Current password is incorrect." });
  if (currentPassword === password) return json(400, { error: "Choose a different password." });
  // Cancel outstanding reset links before replacing credentials.
  await resetStoreProvider().delete(key(session.email));
  await credentials.set(session.email, password);
  return json(200, { ok: true, message: "Password updated. Sign in again using your new password." }, true);
}
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (String(event.body || "").length > 3072) return json(413, { error: "Request is too large." });
  const host = requestHost(event);
  const origin = event.headers?.origin || event.headers?.Origin;
  if (origin && (!host || origin !== "https://" + host))
    return json(403, { error: "Request origin rejected." });
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (_) { return json(400, { error: "Invalid request." }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid request." });
  try {
    // The planner still uses Lambda-compatible Netlify handlers.
    // Connect the request context before accessing Blobs credentials or reset tokens.
    if (event.blobs) connectLambda(event);
    if (body.action === "request") return await requestReset(normalize(body.email), event);
    if (body.action === "reset") return await resetPassword(normalize(body.email), body.token, body.newPassword);
    if (body.action === "change") return await changePassword(event, body.currentPassword, body.newPassword);
    return json(400, { error: "Unsupported password action." });
  } catch (err) {
    console.error("Planner password operation failed:", err.message);
    return json(503, { error: "Password service is temporarily unavailable. Please try again." });
  }
};
exports.__test = { validatePassword, __setResetStoreProvider: (provider) => { resetStoreProvider = provider; } };
