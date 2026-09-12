const LATE_ALERT_LEAD_MS = 5 * 60 * 1000;
const LATE_ALERT_CATCHUP_MS = 30 * 60 * 1000;

function shouldSendLateAlert({ bookingConfirmed, clockIn, alertSent, scheduledStart, now = new Date() }) {
  if (!bookingConfirmed || clockIn || alertSent || !scheduledStart) return false;
  const start = new Date(scheduledStart);
  const current = new Date(now);
  if (Number.isNaN(start.getTime()) || Number.isNaN(current.getTime())) return false;
  const alertAt = start.getTime() - LATE_ALERT_LEAD_MS;
  return current.getTime() >= alertAt && current.getTime() <= start.getTime() + LATE_ALERT_CATCHUP_MS;
}

function lateAlertMessage(fields = {}) {
  const assignment = String(fields.Assignment || "Scheduled event").trim();
  const ambassador = Array.isArray(fields["Ambassador Name"])
    ? fields["Ambassador Name"][0]
    : fields["Ambassador Name"];
  return `Late clock-in alert: ${assignment}${ambassador ? ` — ${ambassador}` : ""} has no clock-in five minutes before the scheduled start.`;
}

module.exports = {
  LATE_ALERT_LEAD_MS,
  LATE_ALERT_CATCHUP_MS,
  shouldSendLateAlert,
  lateAlertMessage
};
