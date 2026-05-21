const Airtable = require("airtable");

const BASE_ID = process.env.AIRTABLE_BASE_ID || "appqulbpEb4AWfb75";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const TABLES = {
  BRANDS: process.env.AIRTABLE_BRANDS_TABLE || "tblKvHgYsWiyyUlow",
  STORES: process.env.AIRTABLE_STORES_TABLE || "tblQB27xwvKiVyLWW",
  EVENTS: process.env.AIRTABLE_EVENTS_TABLE || "tblEpybLYG9dJmtEz"
};

function getBase() {
  if (!AIRTABLE_TOKEN) {
    throw new Error("Missing AIRTABLE_TOKEN environment variable.");
  }

  Airtable.configure({ apiKey: AIRTABLE_TOKEN });
  return Airtable.base(BASE_ID);
}

module.exports = { getBase, TABLES };
