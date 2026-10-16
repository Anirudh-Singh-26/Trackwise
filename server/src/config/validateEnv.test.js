import test from "node:test";
import assert from "node:assert/strict";
import { validateEnv } from "./validateEnv.js";

const validDevelopment = {
  NODE_ENV: "development",
  PORT: "5000",
  MONGODB_URI: "mongodb://127.0.0.1:27017/trackwise",
  JWT_SECRET: "test-only-secret-that-is-long-enough-123456",
  CLIENT_ORIGIN: "http://localhost:5173",
  COOKIE_SECURE: "false",
};

test("accepts a valid development configuration", () => {
  assert.deepEqual(validateEnv(validDevelopment), { port: 5000, isProduction: false });
});

test("rejects placeholder or short JWT secrets", () => {
  assert.throws(() => validateEnv({ ...validDevelopment, JWT_SECRET: "replace_with_a_long_random_secret_value" }), /JWT_SECRET/);
  assert.throws(() => validateEnv({ ...validDevelopment, JWT_SECRET: "short" }), /JWT_SECRET/);
});

test("requires bootstrap admin credentials as a pair", () => {
  assert.throws(() => validateEnv({ ...validDevelopment, INITIAL_ADMIN_EMAIL: "admin@example.com" }), /must be configured together/);
});

test("requires HTTPS and secure cookies in production", () => {
  const production = { ...validDevelopment, NODE_ENV: "production" };
  assert.throws(() => validateEnv(production), /COOKIE_SECURE=true/);
  assert.throws(() => validateEnv({ ...production, COOKIE_SECURE: "true", CLIENT_ORIGIN: "http://example.com" }), /must use HTTPS/);
  assert.deepEqual(validateEnv({ ...production, COOKIE_SECURE: "true", CLIENT_ORIGIN: "https://app.example.com" }), { port: 5000, isProduction: true });
});

test("rejects invalid ports and malformed bootstrap email", () => {
  assert.throws(() => validateEnv({ ...validDevelopment, PORT: "70000" }), /PORT/);
  assert.throws(() => validateEnv({ ...validDevelopment, INITIAL_ADMIN_EMAIL: "bad", INITIAL_ADMIN_PASSWORD: "a-strong-password" }), /valid email/);
});

test("rejects a documented/example bootstrap password", () => {
  assert.throws(() => validateEnv({ ...validDevelopment, INITIAL_ADMIN_EMAIL: "admin@example.com", INITIAL_ADMIN_PASSWORD: "ChangeThisStrongPassword123!" }), /placeholder password/);
});
