"use strict";
const { secureCookie, authenticate, issue, verify, configured } = require("./_planner-auth");
function json(statusCode, body, cookie) {
  return { statusCode, headers: {
    "Content-Type": "application/json", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(cookie ? { "Set-Cookie": cookie } : {})
  }, body: JSON.stringify(body) };
}
exports.handler = async event => {
  if (event.httpMethod === "DELETE") return json(200, { ok: true }, secureCookie("", 0));
  if (!configured()) return json(503, { error: "Planner sign-in is not configured. Contact the administrator." });
  if (event.httpMethod === "GET") {
    const session = verify(event.headers);
    return session ? json(200, { ok: true, email: session.email }) : json(401, { error: "Sign in required." });
  }
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if ((event.body || "").length > 4096) return json(413, { error: "Request too large." });
  try {
    const { email, password } = JSON.parse(event.body || "{}");
    const account = authenticate(email, password);
    if (!account) return json(401, { error: "Invalid email or password." });
    const token = issue(account);
    return json(200, { ok: true, email: account }, secureCookie(token, 8 * 60 * 60));
  } catch (_) {
    return json(400, { error: "Unable to sign in. Check your credentials or contact the administrator." });
  }
};
