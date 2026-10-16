import test from "node:test";
import assert from "node:assert/strict";
import { parseDateRange } from "./dateRange.js";

test("date-only range includes the complete end date", () => {
  const range = parseDateRange("2026-10-01", "2026-10-14");
  assert.equal(range.from.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-10-14T23:59:59.999Z");
});

test("timestamp inputs preserve their exact instants", () => {
  const range = parseDateRange("2026-10-01T09:30:00.000Z", "2026-10-14T18:15:00.000Z");
  assert.equal(range.from.toISOString(), "2026-10-01T09:30:00.000Z");
  assert.equal(range.to.toISOString(), "2026-10-14T18:15:00.000Z");
});

test("rejects impossible dates and reversed ranges", () => {
  assert.equal(parseDateRange("2026-02-30", "2026-03-01"), null);
  assert.equal(parseDateRange("2026-10-15", "2026-10-14"), null);
});

test("uses predictable defaults when filters are omitted", () => {
  const now = new Date("2026-10-14T12:00:00.000Z");
  const range = parseDateRange(undefined, undefined, { defaultDays: 30, now });
  assert.equal(range.from.toISOString(), "2026-09-14T12:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-10-14T12:00:00.000Z");
});

test("supports an epoch default for unbounded audit history", () => {
  const range = parseDateRange(undefined, undefined, { now: new Date("2026-10-14T12:00:00.000Z"), defaultFrom: new Date(0) });
  assert.equal(range.from.toISOString(), "1970-01-01T00:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-10-14T12:00:00.000Z");
});
