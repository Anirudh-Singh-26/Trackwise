import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SCREENSHOT_POLICY, validatePolicy } from "./policy.js";

test("default screenshot policy matches initial product decision", () => {
  assert.deepEqual(DEFAULT_SCREENSHOT_POLICY, {
    enabled: true,
    intervalSeconds: 30,
    idleThresholdSeconds: 60,
    captureScope: "visible-tab",
    pauseDuringIdle: true,
    pauseDuringBreaks: true,
    retentionDays: 7,
    excludedDomains: [],
  });
});

test("accepts the proposed policy", () => {
  assert.equal(validatePolicy({ ...DEFAULT_SCREENSHOT_POLICY }), null);
});

test("rejects intervals below supported minimum", () => {
  assert.match(validatePolicy({ ...DEFAULT_SCREENSHOT_POLICY, intervalSeconds: 10 }), /intervalSeconds/);
});

test("rejects intervals outside the allowed range", () => {
  assert.match(validatePolicy({ ...DEFAULT_SCREENSHOT_POLICY, intervalSeconds: 301 }), /intervalSeconds/);
});

test("rejects non-visible-tab capture scopes", () => {
  assert.match(validatePolicy({ ...DEFAULT_SCREENSHOT_POLICY, captureScope: "desktop" }), /captureScope/);
});

test("rejects invalid retention values", () => {
  assert.match(validatePolicy({ ...DEFAULT_SCREENSHOT_POLICY, retentionDays: 0 }), /retentionDays/);
});

test("rejects invalid excluded domains", () => {
  assert.match(validatePolicy({ ...DEFAULT_SCREENSHOT_POLICY, excludedDomains: ["https://example.com/path"] }), /excludedDomains/);
});

test("accepts explicit excluded domains", () => {
  assert.equal(validatePolicy({ ...DEFAULT_SCREENSHOT_POLICY, excludedDomains: ["bank.example.com", "private.example.org"] }), null);
});

test("accepts a two-day retention policy", () => {
  assert.equal(validatePolicy({ ...DEFAULT_SCREENSHOT_POLICY, retentionDays: 2 }), null);
});

test("rejects idle thresholds outside the supported range", () => {
  assert.match(validatePolicy({ ...DEFAULT_SCREENSHOT_POLICY, idleThresholdSeconds: 15 }), /idleThresholdSeconds/);
});
