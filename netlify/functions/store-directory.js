const { TABLES, listRecords } = require("./_airtable");
const headers = { "Content-Type": "application/json" };
function json(statusCode, body) { return { statusCode, headers, body: JSON.stringify(body) }; }
function scalar(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value.name || value.value || "";
  return value || "";
}
function toStore(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    name: scalar(f["Store Name"]),
    address: scalar(f.Address),
    notes: scalar(f.Notes),
    state: scalar(f.State),
    status: scalar(f.Status),
    latitude: Number(f.Latitude) || null,
    longitude: Number(f.Longitude) || null,
    timezone: scalar(f["Store Timezone"]),
    region: scalar(f.Region),
    gpsReadiness: scalar(f["GPS Readiness"]),
    googlePlaceId: scalar(f["Google Place ID"]),
    eventCount: Array.isArray(f.Events) ? f.Events.length : 0
  };
}
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });
    const stores = (await listRecords(TABLES.STORES))
      .map(toStore)
      .filter((store) => store.name || store.address)
      .sort((a,b) => a.name.localeCompare(b.name));
    return json(200, { stores });
  } catch (error) {
    return json(400, { error: error.message || "Could not load stores." });
  }
};