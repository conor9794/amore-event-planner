const { TABLES, airtableRequest, listRecords } = require("./_airtable");

const headers = { "Content-Type": "application/json" };

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function text(value) {
  if (Array.isArray(value)) return value.join(", ");
  return value || "";
}

function array(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function photoUrl(value) {
  const attachment = Array.isArray(value) ? value[0] : null;
  return attachment?.thumbnails?.large?.url || attachment?.url || "";
}

function toAmbassador(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    name: text(f["Ambassador Name"] || f.Name || f["Full Name"]),
    email: text(f.Email),
    state: array(f.State),
    region: array(f.Region),
    photoUrl: photoUrl(f.Headshot),
    bookingCount: Array.isArray(f.Bookings) ? f.Bookings.length : 0
  };
}

function fieldsFrom(payload) {
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim();
  const state = array(payload.state);
  const region = array(payload.region);
  const photo = String(payload.photoUrl || "").trim();

  if (!name) throw new Error("Name is required.");
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
  if (photo && !/^https?:\/\//i.test(photo)) throw new Error("Photo must be a valid https:// or http:// URL.");

  const fields = { "Ambassador Name": name, Email: email || undefined };
  if (state.length) fields.State = state;
  if (region.length) fields.Region = region;
  if (photo) fields.Headshot = [{ url: photo }];
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

async function readBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    throw new Error("Invalid request body.");
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "GET") {
      const ambassadors = (await listRecords(TABLES.AMBASSADORS))
        .map(toAmbassador)
        .filter((ambassador) => ambassador.name || ambassador.email)
        .sort((a, b) => a.name.localeCompare(b.name));
      return json(200, { ambassadors });
    }

    const payload = await readBody(event);

    if (event.httpMethod === "POST") {
      const result = await airtableRequest(encodeURIComponent(TABLES.AMBASSADORS), {
        method: "POST",
        body: JSON.stringify({ fields: fieldsFrom(payload), typecast: true })
      });
      return json(201, { ambassador: toAmbassador(result) });
    }

    if (event.httpMethod === "PATCH") {
      if (!payload.id) throw new Error("Ambassador ID is required.");
      const result = await airtableRequest(`${encodeURIComponent(TABLES.AMBASSADORS)}/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify({ fields: fieldsFrom(payload), typecast: true })
      });
      return json(200, { ambassador: toAmbassador(result) });
    }

    if (event.httpMethod === "DELETE") {
      if (!payload.id) throw new Error("Ambassador ID is required.");
      const records = await listRecords(TABLES.AMBASSADORS, { filterByFormula: `RECORD_ID()='${String(payload.id).replace(/'/g, "\\'")}'` });
      const record = records[0];
      if (!record) return json(404, { error: "Ambassador not found." });
      if (Array.isArray(record.fields?.Bookings) && record.fields.Bookings.length) {
        return json(409, { error: "This ambassador has booking history and cannot be deleted. Keep the historical record intact instead." });
      }
      await airtableRequest(`${encodeURIComponent(TABLES.AMBASSADORS)}/${payload.id}`, { method: "DELETE" });
      return json(200, { deleted: true });
    }

    return json(405, { error: "Method not allowed." });
  } catch (error) {
    return json(400, { error: error.message || "Could not update ambassador." });
  }
};
