const { TABLES, listRecords } = require("./_airtable");

function value(fields, names) {
  for (const name of names) {
    if (fields && fields[name] !== undefined && fields[name] !== null && fields[name] !== "") return fields[name];
  }
  return "";
}

exports.handler = async () => {
  try {
    const records = await listRecords(TABLES.AMBASSADORS, {
      maxRecords: "200",
      "sort[0][field]": "Name",
      "sort[0][direction]": "asc"
    });

    const ambassadors = records
      .map((record) => {
        const f = record.fields || {};
        return {
          id: record.id,
          name: value(f, ["Name", "Ambassador Name"]),
          email: value(f, ["Email", "Ambassador Email"]),
          phone: value(f, ["Phone Number", "Phone"]),
          active: f["Active"] !== false
        };
      })
      .filter((ambassador) => ambassador.name || ambassador.email);

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
