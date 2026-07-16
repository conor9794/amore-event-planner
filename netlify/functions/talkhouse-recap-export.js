const GOOGLE_WEBHOOK_URL = process.env.TALKHOUSE_GOOGLE_WEBHOOK_URL;
const SHARED_SECRET = process.env.TALKHOUSE_SHARED_SECRET;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed." });
  }

  if (!GOOGLE_WEBHOOK_URL || !SHARED_SECRET) {
    return json(500, {
      ok: false,
      error: "Missing Talkhouse relay environment variables."
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body." });
  }

  if (payload.secret !== SHARED_SECRET) {
    return json(401, { ok: false, error: "Unauthorized request." });
  }

  try {
    const googleResponse = await fetch(GOOGLE_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      redirect: "follow"
    });

    const responseText = await googleResponse.text();

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (_error) {
      return json(502, {
        ok: false,
        error: "Google webhook returned a non-JSON response.",
        status: googleResponse.status,
        responsePreview: responseText.slice(0, 500)
      });
    }

    if (!googleResponse.ok || !result.ok) {
      return json(502, {
        ok: false,
        error: result.error || `Google webhook failed with HTTP ${googleResponse.status}`,
        googleStatus: googleResponse.status
      });
    }

    return json(200, result);
  } catch (error) {
    return json(500, {
      ok: false,
      error: String(error.message || error)
    });
  }
};