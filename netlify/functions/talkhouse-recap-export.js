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
    return json(