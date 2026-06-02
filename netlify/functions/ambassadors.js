const { TABLES, listRecords } = require("./_airtable");

function value(fields, names) {
  for (const name of names) {
    if (fields && fields[name] !== undefined && fields[name] !== null && fields[name] !== "") return fields[name];
  }
  return "";
}

function asText(v) {
  if (Array.isArray(v)) return v.join(", ");
  return v || "";
}

exports.handler = async () => {
  try {
    // Do not sort in Airtable here. If a field name differs between bases, Airtable returns
    // "Unknown field name" before the page can load. We sort safely after reading.
    // Load all ambassadors. Airtable's maxRecords would cap this table, and this base
    // already has more than 500 ambassador records. Capping caused later alphabetic
    // names, such as Test Conor, to never reach the search list.
    const records = await listRecords(TABLES.AMBASSADORS);

    const ambassadors = records
      .map((record) => {
        const f = record.fields || {};
        const name = asText(value(f, [
          "Name",
          "Ambassador Name",
          "Full Name",
          "BA Name",
          "Staff Name",
          "Ambassador"
        ]));
        const email = asText(value(f, [
          "Email",
          "Ambassador Email",
          "Email Address",
          "Staff Email"
        ]));

        return {
          id: record.id,
          name,
          email,
          phone: asText(value(f, ["Phone Number", "Phone", "Mobile", "Cell"])),
          active: f["Active"] !== false
        };
      })
      .filter((ambassador) => ambassador.name || ambassador.email)
      .sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || ""));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ambassadors })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
