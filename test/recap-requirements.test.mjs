import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { recapRequirements } = require("../netlify/functions/_recap-requirements.js");

test("recap requires a clock-in selfie and both consumer counts", () => {
  assert.deepEqual(recapRequirements({}), {
    complete: false,
    missing: ["clock-in selfie", "consumers seen", "consumers sampled"]
  });
});

test("zero is a valid consumer count", () => {
  assert.deepEqual(recapRequirements({
    clockInPhotos: [{ url: "https://example.com/selfie.jpg" }],
    consumersSeen: 0,
    consumersSampled: 0
  }), { complete: true, missing: [] });
});

test("negative and nonnumeric counts are rejected", () => {
  const result = recapRequirements({ clockInPhotos: [{}], consumersSeen: -1, consumersSampled: "many" });
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, ["consumers seen", "consumers sampled"]);
});
