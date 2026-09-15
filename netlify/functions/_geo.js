const REVIEW_DISTANCE_FEET = 250;
const FEET_PER_METER = 3.28084;
const EARTH_RADIUS_METERS = 6371000;

function finiteNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validCoordinates(latitude, longitude) {
  return latitude !== null && longitude !== null &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function distanceFeetBetween(first, second) {
  const lat1 = finiteNumber(first?.latitude);
  const lng1 = finiteNumber(first?.longitude);
  const lat2 = finiteNumber(second?.latitude);
  const lng2 = finiteNumber(second?.longitude);
  if (!validCoordinates(lat1, lng1) || !validCoordinates(lat2, lng2)) return null;

  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  const meters = 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(meters * FEET_PER_METER);
}

function parseCoordinatesFromMapLink(value) {
  const link = String(value || "");
  if (!link) return null;
  let decoded = link;
  try { decoded = decodeURIComponent(link); } catch (_error) {}
  const patterns = [
    /[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const latitude = finiteNumber(match[1]);
    const longitude = finiteNumber(match[2]);
    if (validCoordinates(latitude, longitude)) return { latitude, longitude };
  }
  return null;
}

function locationReview({ storeLatitude, storeLongitude, submittedLatitude, submittedLongitude, accuracyMeters, thresholdFeet = REVIEW_DISTANCE_FEET }) {
  const distanceFeet = distanceFeetBetween(
    { latitude: storeLatitude, longitude: storeLongitude },
    { latitude: submittedLatitude, longitude: submittedLongitude }
  );
  const accuracy = Math.max(0, finiteNumber(accuracyMeters) || 0);
  const accuracyFeet = Math.round(accuracy * FEET_PER_METER);

  if (distanceFeet === null) {
    return { status: "unavailable", needsReview: false, distanceFeet: null, accuracyFeet, thresholdFeet, label: "Location unavailable" };
  }
  if (distanceFeet <= thresholdFeet) {
    return { status: "within-range", needsReview: false, distanceFeet, accuracyFeet, thresholdFeet, label: `Within range — ${distanceFeet} ft from store` };
  }
  if (distanceFeet - accuracyFeet <= thresholdFeet) {
    return { status: "accuracy-warning", needsReview: false, distanceFeet, accuracyFeet, thresholdFeet, label: `GPS uncertain — ${distanceFeet} ft from store (±${accuracyFeet} ft)` };
  }
  return { status: "needs-review", needsReview: true, distanceFeet, accuracyFeet, thresholdFeet, label: `Review — ${distanceFeet} ft from store` };
}

module.exports = {
  REVIEW_DISTANCE_FEET,
  distanceFeetBetween,
  parseCoordinatesFromMapLink,
  locationReview
};
