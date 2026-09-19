import test from "node:test";
import assert from "node:assert/strict";
import { supportConfig, isWithinHours, urgencyFor } from "../lib/support.js";
const config = supportConfig({});
test("Madrid hours: boundaries, weekdays, summer and winter time", () => {
  for (const [date, expected] of [
    ["2026-09-19T07:59:59Z", false], ["2026-09-19T08:00:00Z", true],
    ["2026-09-19T12:59:59Z", true], ["2026-09-19T13:00:00Z", false],
    ["2026-09-20T08:00:00Z", true], ["2026-09-21T10:00:00Z", false],
    ["2026-01-17T08:59:59Z", false], ["2026-01-17T09:00:00Z", true],
    ["2026-03-29T08:00:00Z", true], ["2026-10-25T09:00:00Z", true],
  ]) assert.equal(isWithinHours(new Date(date), config), expected, date);
});
test("Urgency requires server price and explicit acceptance; priority alone never charges", () => {
  const outside = new Date("2026-09-21T10:00:00Z");
  assert.deepEqual(urgencyFor({ priority: "Urgente" }, outside, config), { requested: false, outsideHours: true, feeCents: 0 });
  assert.throws(() => urgencyFor({ urgencyRequested: true }, outside, config));
  assert.throws(() => urgencyFor({ urgencyRequested: true, urgencyAccepted: true, urgencyFeeCents: 1 }, outside, config));
  assert.equal(urgencyFor({ urgencyRequested: true, urgencyAccepted: true, urgencyFeeCents: 1000 }, outside, config).feeCents, 1000);
  assert.throws(() => urgencyFor({ urgencyRequested: true, urgencyAccepted: true, urgencyFeeCents: 1000 }, new Date("2026-09-19T09:00:00Z"), config));
});
test("Schedule is configurable and invalid settings fail early", () => {
  const earlier = supportConfig({ SUPPORT_START_HOUR: "9" });
  assert.equal(isWithinHours(new Date("2026-09-19T07:30:00Z"), earlier), true);
  assert.throws(() => supportConfig({ SUPPORT_START_HOUR: "16" }));
  assert.throws(() => supportConfig({ URGENCY_FEE_CENTS: "-1" }));
});
