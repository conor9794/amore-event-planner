const { getBase, TABLES } = require("./_airtable");

exports.handler = async () => {
  try {
    const base = getBase();

    const records = await base(TABLES.BRANDS)
      .select({
        fields: ["Brand Name"],
        sort: [{ field: "Brand Name", direction: "asc" }]
      })
      .all();

    const brands = records
      .map(record => ({
        id: record.id,
        name: record.get("Brand Name")
      }))
      .filter(brand => brand.name);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brands })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
