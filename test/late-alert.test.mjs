import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { LATE_ALERT_LEAD_MS, shouldSendLateAlert, lateAlertMessage } = require("../netlify/functions/_late-alert-core.js");

test("late alert becomes due exactly five minutes before start", () => {
  assert.equal(LATE_ALERT_LEAD_MS, 5 * 60 * 1000);
  const base = { bookingConfirmed: true, scheduledStart: "2026-09-12T18:00:00Z" };
  assert.equal(shouldSendLateAlert({ ...base, now: "2026-09-12T17:54:59Z" }), false);
  assert.equal(shouldSendLateAlert({ ...base, now: "2026-09-12T17:55:00Z" }), true);
});

test("alert is suppressed after clock-in, after send, and for unconfirmed bookings", () => {
  const base = { bookingConfirmed: true, scheduledStart: "2026-09-12T18:00:00Z", now: "2026-09-12T17:56:00Z" };
  assert.equal(shouldSendLateAlert({ ...base, clockIn: "2026-09-12T17:55:30Z" }), false);
  assert.equal(shouldSendLateAlert({ ...base, alertSent: true }), false);
  assert.equal(shouldSendLateAlert({ ...base, bookingConfirmed: false }), false);
});

test("stale bookings do not generate delayed alerts", () => {
  assert.equal(shouldSendLateAlert({
    bookingConfirmed: true,
    scheduledStart: "2026-09-12T18:00:00Z",
    now: "2026-09-12T18:30:01Z"
  }), false);
});

test("late alert copy identifies the assignment", () => {
  assert.match(lateAlertMessage({ Assignment: "Social Hour at Test Store" }), /Social Hour at Test Store/);
});
