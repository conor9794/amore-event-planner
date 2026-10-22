// Gate the planner UI and all human-operated APIs with a signed, HttpOnly session.
// Only independently signed legacy recap relays are excluded; scheduled functions are not web-facing.
const SKIP = new Set([
  "/api/planner-auth", "/.netlify/functions/planner-auth",
  "/api/social-hour-recap-export", "/.netlify/functions/social-hour-recap-export",
  "/api/talkhouse-recap-export", "/.netlify/functions/talkhouse-recap-export"
]);
const ALLOWED_USERS = new Set(["conor9794@gmail.com","melinda@amorestaffing.com","tommaguire2323@gmail.com"]);
const cookieName = "amore_planner_session";

function base64ToBytes(base64) {
  const s = base64.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
async function hasValidSession(request) {
  const secret = Netlify.env.get("PLANNER_SESSION_SECRET") || "";
  if (secret.length < 48) return false;
  const cookie = (request.headers.get("cookie") || "").split(";").map(x => x.trim()).find(x => x.startsWith(cookieName + "="));
  if (!cookie) return false;
  const token = cookie.slice(cookieName.length + 1);
  const sections = token.split(".");
  if (sections.length !== 2 || sections[0].length > 2048 || sections[1].length > 256) return false;
  const [payload, signed] = sections;
  let identity;
  try {
    identity = JSON.parse(new TextDecoder().decode(base64ToBytes(payload)));
  } catch (_) { return false; }
  if (identity.v !== 1 || !ALLOWED_USERS.has(identity.email) || !Number.isFinite(identity.exp) || identity.exp <= Date.now() / 1000) return false;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("HMAC", key, base64ToBytes(signed), new TextEncoder().encode(payload));
  } catch (_) { return false; }
}
export default async function (request, context) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (SKIP.has(path)) return context.next();
  // Anonymous access to the standalone login screen, which contains no private data.
  if (path === "/login.html") {
    if (await hasValidSession(request)) return Response.redirect(new URL("/", url), 302);
    return context.next();
  }
  if (!(await hasValidSession(request))) {
    if (path.startsWith("/api/") || path.startsWith("/.netlify/functions/")) {
      return Response.json({ error: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    return Response.redirect(new URL("/login.html", url), 302);
  }
  if (!["GET","HEAD","OPTIONS"].includes(request.method) && (path.startsWith("/api/") || path.startsWith("/.netlify/functions/"))) {
    const origin = request.headers.get("origin");
    if (origin !== url.origin) return Response.json({ error: "Request origin rejected." }, { status: 403 });
  }
  return context.next();
}
export const config = { path: "/*" };
