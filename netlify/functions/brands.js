const { TABLES, listRecords } = require("./_airtable");

exports.handler = async () => {
  try {
    const records = await listRecords(TABLES.BRANDS, {
      "fields[]": ["Brand Name"],
      "sort[0][field]": "Brand Name",
      "sort[0][direction]": "asc"
    });

    const brands = records
      .map((record) => ({
        id: record.id,
        name: record.fields?.["Brand Name"]
      }))
      .filter((brand) => brand.name);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brands })
    };
  } catch (err) {
    const token = process.env.AIRTABLE_TOKEN || "";
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: err.message,
        debug: {
          airtableTokenPresent: Boolean(token),
          airtableTokenStartsWithPat: token.trim().startsWith("pat"),
          airtableTokenLength: token.trim().length,
          airtableBaseId: process.env.AIRTABLE_BASE_ID || "",
          airtableBrandsTable: process.env.AIRTABLE_BRANDS_TABLE || ""
        }
      })
    };
  }
};
