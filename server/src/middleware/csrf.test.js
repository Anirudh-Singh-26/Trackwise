import test from "node:test";
import assert from "node:assert/strict";
import { shouldRejectCookieMutation } from "./csrf.js";

const allowedOrigins = ["http://localhost:5173", "https://trackwise.example.com"];

test("allows safe methods even with a session cookie", () => {
  assert.equal(shouldRejectCookieMutation({ method: "GET", hasSessionCookie: true, fetchSite: "cross-site", origin: "https://evil.example", allowedOrigins }), false);
});

test("rejects cross-site mutations using a session cookie", () => {
  assert.equal(shouldRejectCookieMutation({ method: "POST", hasSessionCookie: true, fetchSite: "cross-site", origin: "https://trackwise.example.com", allowedOrigins }), true);
});

test("rejects untrusted origins for cookie-authenticated mutations", () => {
  assert.equal(shouldRejectCookieMutation({ method: "PATCH", hasSessionCookie: true, fetchSite: "same-site", origin: "https://evil.example", allowedOrigins }), true);
});

test("allows configured same-origin mutations", () => {
  assert.equal(shouldRejectCookieMutation({ method: "POST", hasSessionCookie: true, fetchSite: "same-origin", origin: "http://localhost:5173", allowedOrigins }), false);
});

test("does not block bearer-token requests without a session cookie", () => {
  assert.equal(shouldRejectCookieMutation({ method: "POST", hasSessionCookie: false, fetchSite: "cross-site", origin: "chrome-extension://abc", allowedOrigins }), false);
});

test("allows non-browser clients that omit Origin and Fetch Metadata", () => {
  assert.equal(shouldRejectCookieMutation({ method: "POST", hasSessionCookie: true, fetchSite: undefined, origin: undefined, allowedOrigins }), false);
});
