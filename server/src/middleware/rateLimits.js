import rateLimit from "express-rate-limit";

// Failed authentication attempts are counted; successful logins are removed
// from the counter after the response completes. Limits are per client IP.
const shared = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler(_req, res) {
    res.status(429).json({
      message: "Too many authentication attempts. Please wait before trying again.",
    });
  },
};

export const loginLimiter = rateLimit({
  ...shared,
  limit: 10,
});

export const extensionLoginLimiter = rateLimit({
  ...shared,
  limit: 8,
});
