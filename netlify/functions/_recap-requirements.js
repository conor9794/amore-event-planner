const REQUIRED_RECAP_FIELDS = [
  { key: "clockInPhoto", label: "clock-in selfie" },
  { key: "consumersSeen", label: "consumers seen" },
  { key: "consumersSampled", label: "consumers sampled" }
];

function hasNumber(value) {
  if (value === "" || value === null || value === undefined) return false;
  return Number.isFinite(Number(value)) && Number(value) >= 0;
}

function recapRequirements({ clockInPhotos, consumersSeen, consumersSampled } = {}) {
  const completed = {
    clockInPhoto: Array.isArray(clockInPhotos) && clockInPhotos.length > 0,
    consumersSeen: hasNumber(consumersSeen),
    consumersSampled: hasNumber(consumersSampled)
  };
  const missing = REQUIRED_RECAP_FIELDS
    .filter((field) => !completed[field.key])
    .map((field) => field.label);
  return { complete: missing.length === 0, missing };
}

module.exports = { REQUIRED_RECAP_FIELDS, recapRequirements };
