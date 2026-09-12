import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { REVIEW_DISTANCE_FEET, distanceFeetBetween, parseCoordinatesFromMapLink, locationReview } = require("../netlify/functions/_geo.js");

test("GPS review threshold is 250 feet", () => {
  assert.equal(REVIEW_DISTANCE_FEET, 250);
});

test("parses common Google Maps coordinate links", () => {
  assert.deepEqual(parseCoordinatesFromMapLink("https://maps.google.com/?q=40.9001,-73.1402"), { latitude: 40.9001, longitude: -73.1402 });
  assert.deepEqual(parseCoordinatesFromMapLink("https://www.google.com/maps/@40.9001,-73.1402,17z"), { latitude: 40.9001, longitude: -73.1402 });
});

test("distance calculation returns zero for the same point", () => {
  assert.equal(distanceFeetBetween({ latitude: 40.9, longitude: -73.14 }, { latitude: 40.9, longitude: -73.14 }), 0);
});

test("GPS review flags only readings clearly outside the accuracy buffer", () => {
  const store = { storeLatitude: 40, storeLongitude: -73 };
  const close = locationReview({ ...store, submittedLatitude: 40.0005, submittedLongitude: -73, accuracyMeters: 5 });
  const uncertain = locationReview({ ...store, submittedLatitude: 40.001, submittedLongitude: -73, accuracyMeters: 50 });
  const far = locationReview({ ...store, submittedLatitude: 40.005, submittedLongitude: -73, accuracyMeters: 10 });
  assert.equal(close.status, "within-range");
  assert.equal(uncertain.status, "accuracy-warning");
  assert.equal(far.status, "needs-review");
  assert.equal(far.needsReview, true);
});

test("missing store or submitted coordinates remain visible as unavailable", () => {
  assert.equal(locationReview({}).status, "unavailable");
});
