import legacyPassword from "./planner-password.js";

// Use the validated password-reset logic inside Functions API v2 so Netlify
// Blobs receives its request context automatically. Legacy API v1 is retained
// for regression tests, but the user-facing pages call only this endpoint.
const handler = legacyPassword.__test.createHandler(() => {});

export default async function plannerPasswordV2(request) {
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());
  headers.host = url.host;
  const body = await request.text();
  const result = await handler({
    httpMethod: request.method,
    headers,
    body
  });
  return new Response(result.body || "", {
    status: result.statusCode || 500,
    headers: result.headers || { "Content-Type": "application/json" }
  });
}
