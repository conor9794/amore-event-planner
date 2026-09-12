import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { statusFor, LATE_THRESHOLD_MS } = require("../netlify/functions/todays-events.js");

test("late threshold starts exactly five minutes before the scheduled start", () => {
  const start = "2026-09-12T17:00:00.000Z";
  assert.equal(LATE_THRESHOLD_MS, 300000);
  assert.equal(statusFor({}, start, new Date("2026-09-12T16:54:59.999Z"), true), "upcoming");
  assert.equal(statusFor({}, start, new Date("2026-09-12T16:55:00.000Z"), true), "late");
});

test("assigned unconfirmed bookings remain visible without being marked late", () => {
  const start = "2026-09-12T17:00:00.000Z";
  assert.equal(statusFor({}, start, new Date("2026-09-12T18:00:00.000Z"), false), "unconfirmed");
});

test("attendance takes precedence over confirmation state", () => {
  const start = "2026-09-12T17:00:00.000Z";
  assert.equal(statusFor({ "Clock In Timestamp": "2026-09-12T16:54:00.000Z" }, start, new Date("2026-09-12T18:00:00.000Z"), false), "checked-in");
  assert.equal(statusFor({ "Clock Out Timestamp": "2026-09-12T20:00:00.000Z" }, start, new Date("2026-09-12T21:00:00.000Z"), false), "completed");
});
