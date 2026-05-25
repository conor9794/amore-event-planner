const BASE_ID = process.env.AIRTABLE_BASE_ID || "appqulbpEb4AWfb75";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const TABLES = {
  BRANDS: process.env.AIRTABLE_BRANDS_TABLE || "tblKvHgYsWiyyUlow",
  STORES: process.env.AIRTABLE_STORES_TABLE || "tblQB27xwvKiVyLWW",
  EVENTS: process.env.AIRTABLE_EVENTS_TABLE || "tblEpybLYG9dJmtEz"
};

function requireToken() {
  if (!AIRTABLE_TOKEN) {
    throw new Error("Missing AIRTABLE_TOKEN environment variable.");
  }
  return AIRTABLE_TOKEN.trim();
}

function airtableUrl(tableId, params = {}) {
  const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`);
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, v));
    } else if (value !== undefined && value !== null && value !== "") {
      url.searchParams.append(key, value);
    }
  });
  return url.toString();
}

async function airtableRequest(pathOrUrl, options = {}) {
  const token = requireToken();
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `https://api.airtable.com/v0/${BASE_ID}/${pathOrUrl}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_err) {
    data = { raw: text };
  }

  if (!res.ok) {
    const airtableMessage = data?.error?.message || data?.error || data?.raw || `Airtable request failed with ${res.status}`;
    throw new Error(typeof airtableMessage === "string" ? airtableMessage : JSON.stringify(airtableMessage));
  }

  return data;
}

async function listRecords(tableId, params = {}) {
  let records = [];
  let offset;

  do {
    const url = airtableUrl(tableId, { ...params, offset });
    const data = await airtableRequest(url);
    records = records.concat(data.records || []);
    offset = data.offset;
  } while (offset);

  return records;
}

async function createRecord(tableId, fields) {
  const data = await airtableRequest(tableId, {
    method: "POST",
    body: JSON.stringify({ fields })
  });
  return data;
}

async function updateRecord(tableId, recordId, fields) {
  const data = await airtableRequest(`${encodeURIComponent(tableId)}/${recordId}`, {
    method: "PATCH",
    body: JSON.stringify({ fields })
  });
  return data;
}

module.exports = { TABLES, airtableUrl, airtableRequest, listRecords, createRecord, updateRecord };
