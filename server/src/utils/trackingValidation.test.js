import test from "node:test";
import assert from "node:assert/strict";
import { isValidDomain, validateTrackingEvent } from "./trackingValidation.js";

const now = Date.parse("2026-10-14T10:00:00.000Z");
const validEvent = {
  eventId: "evt-1234567890",
  schemaVersion: 1,
  type: "DOMAIN_STATE_CHANGE",
  domain: "docs.example.com",
  observedAt: "2026-10-14T09:59:00.000Z",
  sessionId: "507f1f77bcf86cd799439011",
};

test("accepts valid domain-only tracking events", () => {
  assert.equal(isValidDomain("docs.example.com"), true);
  assert.equal(validateTrackingEvent(validEvent, now), null);
});

test("rejects malformed domains, localhost and overlong event IDs", () => {
  assert.equal(isValidDomain("bad domain"), false);
  assert.equal(isValidDomain("localhost"), false);
  assert.equal(validateTrackingEvent({ ...validEvent, eventId: "x".repeat(129) }, now), "Invalid event ID");
  assert.equal(validateTrackingEvent({ ...validEvent, domain: "bad domain" }, now), "Invalid domain");
});

test("rejects unsupported event schema and malformed session IDs", () => {
  assert.equal(validateTrackingEvent({ ...validEvent, schemaVersion: 2 }, now), "Unsupported event schema or type");
  assert.equal(validateTrackingEvent({ ...validEvent, sessionId: "not-an-object-id" }, now), "Invalid session ID");
});

test("rejects future, stale and non-string timestamps", () => {
  assert.equal(validateTrackingEvent({ ...validEvent, observedAt: "2026-10-14T10:03:00.000Z" }, now), "Timestamp outside accepted window");
  assert.equal(validateTrackingEvent({ ...validEvent, observedAt: "2026-10-13T09:59:00.000Z" }, now), "Timestamp outside accepted window");
  assert.equal(validateTrackingEvent({ ...validEvent, observedAt: 1791971940000 }, now), "Invalid timestamp");
});

test("rejects empty and non-object payloads", () => {
  assert.equal(validateTrackingEvent(null, now), "Invalid event");
  assert.equal(validateTrackingEvent([], now), "Invalid event");
});

test("accepts visit start and end events with a visit ID and tab ID", () => {
  const visit = { ...validEvent, type: "VISIT_START", visitId: "550e8400-e29b-41d4-a716-446655440000", tabId: 12 };
  assert.equal(validateTrackingEvent(visit, now), null);
  assert.equal(validateTrackingEvent({ ...visit, type: "VISIT_END" }, now), null);
});

test("rejects visit events without valid visit metadata", () => {
  const visit = { ...validEvent, type: "VISIT_START", visitId: "bad", tabId: 12 };
  assert.equal(validateTrackingEvent(visit, now), "Invalid visit ID");
  assert.equal(validateTrackingEvent({ ...visit, visitId: "550e8400-e29b-41d4-a716-446655440000", tabId: -1 }, now), "Invalid tab ID");
});


test("accepts idle start and end events with an activity ID", () => {
  const idle = { ...validEvent, type: "IDLE_START", domain: "system.activity", activityId: "550e8400-e29b-41d4-a716-446655440000" };
  assert.equal(validateTrackingEvent(idle, now), null);
  assert.equal(validateTrackingEvent({ ...idle, type: "IDLE_END" }, now), null);
});

test("rejects idle events without valid activity metadata", () => {
  const idle = { ...validEvent, type: "IDLE_START", domain: "system.activity" };
  assert.equal(validateTrackingEvent(idle, now), "Invalid activity ID");
});


test("accepts tab-switch events with destination and optional previous domain", () => {
  const switched = { ...validEvent, type: "TAB_SWITCH", domain: "mail.google.com", previousDomain: "github.com", tabId: 42 };
  assert.equal(validateTrackingEvent(switched, now), null);
  assert.equal(validateTrackingEvent({ ...switched, previousDomain: "bad domain" }, now), "Invalid previous domain");
  assert.equal(validateTrackingEvent({ ...switched, tabId: -1 }, now), "Invalid tab ID");
});
