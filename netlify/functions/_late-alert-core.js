const LATE_ALERT_LEAD_MS = 5 * 60 * 1000;

function shouldSendLateAlert({ bookingConfirmed, clockIn, alertSent, scheduledStart, now = new Date() }) {
  if (!bookingConfirmed || clockIn || alertSent || !scheduledStart) return false;

  const start = new Date(scheduledStart);
  const current = new Date(now);
  if (Number.isNaN(start.getTime()) || Number.isNaN(current.getTime())) return false;

  const alertAt = start.getTime() - LATE_ALERT_LEAD_MS;
  return current.getTime() >= alertAt && current.getTime() < start.getTime();
}

function lateAlertMessage(fields = {}) {
  const assignment = String(fields.Assignment || "Scheduled event").trim();
  const ambassador = fields["Ambassador Name Text"];

  return `Clock-in missing: ${assignment}${ambassador ? ` — ${ambassador}` : ""} has not clocked in with five minutes remaining before the scheduled start.`;
}

module.exports = {
  LATE_ALERT_LEAD_MS,
  shouldSendLateAlert,
  lateAlertMessage
};
