import core from "./_planner-auth.js";

const { authenticate, issue, secureCookie, configured } = core;

function response(status, data, cookie) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(cookie ? { "Set-Cookie": cookie } : {})
    }
  });
}

// Netlify Functions v2 automatically injects the Blobs environment on each
// request. Do not use Lambda compatibility mode for the credential store.
export default async function plannerLogin(request) {
  if (request.method !== "POST") {
    return response(405, { error: "Method not allowed." });
  }
  const source = request.headers.get("origin");
  if (source && source !== new URL(request.url).origin) {
    return response(403, { error: "Request origin rejected." });
  }
  if (!configured()) {
    return response(503, { error: "Planner sign-in is not configured. Contact the administrator." });
  }
  try {
    const text = await request.text();
    if (text.length > 4096) return response(413, { error: "Request too large." });
    const { email, password } = JSON.parse(text || "{}");
    const account = await authenticate(email, password);
    if (!account) return response(401, { error: "Invalid email or password." });
    return response(200, { ok: true, email: account }, secureCookie(issue(account), 8 * 60 * 60));
  } catch (error) {
    console.error("[planner-login-v2] Authentication failed:", error?.name || "UnknownError", error?.message || "");
    return response(503, { error: "Login service is temporarily unavailable. Please try again." });
  }
}
