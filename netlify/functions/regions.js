const { listRecords } = require("./_airtable");

const REGIONS_TABLE = process.env.AIRTABLE_REGIONS_TABLE || "tblBzNsZBH3stZwiJ";

exports.handler = async (event) => {
  if (event?.httpMethod && event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method not allowed." })
    };
  }

  try {
    const records = await listRecords(REGIONS_TABLE, {
      "fields[]": ["Region Name", "State", "Status"],
      "sort[0][field]": "Region Name",
      "sort[0][direction]": "asc"
    });
    const regions = records
      .map((record) => ({
        id: record.id,
        name: String(record.fields?.["Region Name"] || "").trim(),
        state: String(record.fields?.State || "").trim(),
        status: String(record.fields?.Status || "").trim()
      }))
      .filter((region) =>
        region.name && (region.status === "Approved" || region.status === "Existing / Review")
      )
      .map(({ id, name, state }) => ({ id, name, state }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ regions })
    };
  } catch (err) {
    console.error("Could not load operating regions", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Could not load operating regions." })
    };
  }
};
