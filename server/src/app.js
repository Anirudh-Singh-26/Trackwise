import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import sessionRoutes from "./routes/sessions.js";
import breakRoutes from "./routes/breaks.js";
import trackingRoutes from "./routes/tracking.js";
import reportRoutes from "./routes/reports.js";
import auditRoutes from "./routes/audit.js";
import screenshotRoutes from "./modules/screenshots/routes.js";
import { requireAuth } from "./middleware/auth.js";
import { getDatabaseHealth } from "./config/db.js";
import { loginLimiter, extensionLoginLimiter } from "./middleware/rateLimits.js";
import { csrfProtection } from "./middleware/csrf.js";
const app = express();
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);

// Structured request logging. Never log request bodies, cookies, tokens, or passwords.
app.use((req, res, next) => {
  const startedAt = Date.now();
  const requestId =
    globalThis.crypto?.randomUUID?.() ||
    `req-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  res.on("finish", () => {
    const record = {
      level: "info",
      event: "http_request",
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
    };
    console.log(JSON.stringify(record));
  });
  next();
});
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin(origin, callback) {
      // Non-browser clients commonly omit Origin. Browser origins must match an
      // explicit allowlist; extension origins are never wildcard-allowed.
      if (!origin) return callback(null, true);
      const configured = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
        .split(",").map((value) => value.trim()).filter(Boolean);
      const extensionOrigin = process.env.EXTENSION_ORIGIN?.trim();
      if (configured.includes(origin) || (extensionOrigin && origin === extensionOrigin)) {
        return callback(null, true);
      }
      const error = new Error("Origin not allowed by CORS");
      error.status = 403;
      return callback(error);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    maxAge: 600,
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
// Defense in depth for cookie-authenticated mutations. API clients and extension
// bearer-token requests without the dashboard cookie are not affected.
app.use(csrfProtection);
app.use(
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
app.get("/api/v1/health", (req, res) => {
  const database = getDatabaseHealth();
  const ready = database.connected;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "degraded",
    service: "trackwise-api",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database,
  });
});
app.use("/api/v1/auth/login", loginLimiter);
app.use("/api/v1/auth/extension-login", extensionLoginLimiter);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", requireAuth, userRoutes);
app.use("/api/v1/sessions", requireAuth, sessionRoutes);
app.use("/api/v1", requireAuth, breakRoutes);
app.use("/api/v1/tracking", requireAuth, trackingRoutes);
app.use("/api/v1/reports", requireAuth, reportRoutes);
app.use("/api/v1/audit", requireAuth, auditRoutes);
app.use("/api/v1/screenshots", requireAuth, screenshotRoutes);
app.use((req, res) =>
  res
    .status(404)
    .json({ message: `Route not found: ${req.method} ${req.path}` }),
);
app.use((err, req, res, next) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "unhandled_error",
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      message: err?.message,
      stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    }),
  );
  if (res.headersSent) return next(err);
  if (err?.message === "Origin not allowed by CORS") return res.status(403).json({ message: "Origin not allowed", requestId: req.requestId });
  if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 600) return res.status(err.status).json({ message: err.message || "Request failed", requestId: req.requestId });
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "Screenshot exceeds the 2 MB upload limit", requestId: req.requestId });
  if (err?.name === "MulterError") return res.status(400).json({ message: "Invalid screenshot upload", requestId: req.requestId });
  if (err?.name === "CastError") return res.status(400).json({ message: "Invalid resource ID", requestId: req.requestId });
  if (err?.name === "ValidationError") return res.status(400).json({ message: "Validation failed", details: Object.values(err.errors || {}).map((item) => item.message), requestId: req.requestId });
  res.status(err.status || 500).json({ message: err.status ? err.message : "Internal server error", requestId: req.requestId });
});
export default app;
