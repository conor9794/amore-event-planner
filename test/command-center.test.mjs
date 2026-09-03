import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const core = require("../public/command-center-core.js");

const now = new Date("2026-09-03T12:00:00Z");
const events = [
  { id: "one", name: "Alpha Market", brand: "Brand A", eventArea: "NYC", startTime: "2026-09-05T18:00:00Z", bookingCount: 0, confirmedBookingCount: 0, ambassadorNames: [] },
  { id: "two", name: "Bravo Shop", brand: "Brand B", eventArea: "NJ", startTime: "2026-09-09T18:00:00Z", bookingCount: 2, confirmedBookingCount: 1, ambassadorNames: ["Alex Rivera"] },
  { id: "three", name: "Charlie Store", brand: "Brand A", eventArea: "NYC", startTime: "2026-10-15T18:00:00Z", bookingCount: 1, confirmedBookingCount: 1, ambassadorNames: ["Sam Lee"] }
];

test("command center statuses, filters, and metrics are deterministic", () => {
  assert.deepEqual(core.operationalStatus(events[0]), { key: "unstaffed", label: "Needs staff" });
  assert.deepEqual(core.operationalStatus(events[1]), { key: "unconfirmed", label: "Needs confirmation" });
  assert.deepEqual(core.operationalStatus(events[2]), { key: "confirmed", label: "Confirmed" });
  assert.deepEqual(core.filterEvents(events, { period: "7", region: "all", search: "" }, now).map((event) => event.id), ["one", "two"]);
  assert.deepEqual(core.filterEvents(events, { period: "all", region: "NYC", search: "sam" }, now).map((event) => event.id), ["three"]);
  assert.deepEqual(core.filterEvents(events, { period: "all", region: "all", brand: "Brand B", search: "" }, now).map((event) => event.id), ["two"]);
  assert.deepEqual(core.metrics(events, [{}, {}], [{}], [{ payroll: { totalPayrollDue: 125.5 } }, { payroll: { totalPayrollDue: 74.5 } }], now), {
    upcoming: 3,
    nextSevenDays: 2,
    needsStaff: 1,
    unconfirmed: 2,
    recaps: 1,
    payrollCount: 2,
    payrollTotal: 200
  });
});

test("past-event filters and history protection statuses are deterministic", () => {
  const past = [
    { id: "recent", startTime: "2026-09-01T18:00:00Z", historyLockedBookingCount: 1 },
    { id: "older", startTime: "2026-08-01T18:00:00Z", historyLockedBookingCount: 0 },
    { id: "too-old", startTime: "2026-05-01T18:00:00Z", historyLockedBookingCount: 0 }
  ];
  assert.deepEqual(core.pastOperationalStatus(past[0]), { key: "locked", label: "History protected" });
  assert.deepEqual(core.pastOperationalStatus(past[1]), { key: "editable", label: "Editable" });
  assert.deepEqual(core.filterEvents(past, { view: "past", period: "30" }, now).map((event) => event.id), ["recent"]);
  assert.deepEqual(core.filterEvents(past, { view: "past", period: "90" }, now).map((event) => event.id), ["recent", "older"]);
});

test("event edit payload does not trigger schedule reconfirmation when times are unchanged", () => {
  assert.deepEqual(core.editPayload({
    id: "recABCDEFGHIJKLMN",
    eventDate: "2026-09-12",
    localStartTime: "18:00",
    localEndTime: "21:00"
  }, {
    eventDate: "2026-09-12",
    startTime: "18:00",
    endTime: "21:00",
    eventArea: " NYC ",
    hourlyRate: "32.50",
    details: " Updated ",
    portalVisible: false
  }), {
    eventId: "recABCDEFGHIJKLMN",
    eventArea: "NYC",
    hourlyRate: "32.50",
    details: "Updated",
    portalVisible: false
  });
});

test("event edit payload includes the complete schedule when a time changes", () => {
  const payload = core.editPayload({
    id: "recABCDEFGHIJKLMN",
    eventDate: "2026-09-12",
    localStartTime: "18:00",
    localEndTime: "21:00"
  }, {
    eventDate: "2026-09-12",
    startTime: "18:30",
    endTime: "21:00",
    eventArea: "NYC",
    hourlyRate: "32.50",
    details: "Updated",
    portalVisible: true
  });
  assert.equal(payload.eventDate, "2026-09-12");
  assert.equal(payload.startTime, "18:30");
  assert.equal(payload.endTime, "21:00");
});

test("dashboard excludes old, confirmed, and history-locked bookings from its confirmation count", () => {
  const upcoming = [{
    bookings: [
      { id: "active", confirmed: false, historyLocked: false },
      { id: "confirmed", confirmed: true, historyLocked: false },
      { id: "historical", confirmed: false, historyLocked: true }
    ]
  }];
  const allUnconfirmed = [{ id: "active" }, { id: "historical" }, { id: "old-event" }];
  assert.deepEqual(core.relevantUnconfirmedBookings(upcoming, allUnconfirmed), [{ id: "active" }]);
});

test("desktop markup has unique ids, both dashboard scripts, and only two workflow queues", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, "Every HTML id must be unique");
  assert.match(html, /command-center-core\.js[\s\S]*command-center\.js/);
  assert.match(html, /id="commandViewFilter"/);
  assert.doesNotMatch(html, /Missing documents/i);
  const css = await readFile(new URL("../public/command-center.css", import.meta.url), "utf8");
  assert.match(css, /\.desktopOnly[\s\S]*display:\s*none/);
});
