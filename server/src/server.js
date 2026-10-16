import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { validateEnv } from "./config/validateEnv.js";
import User from "./models/User.js";
import { cleanupExpiredScreenshots } from "./modules/screenshots/retention.js";

const { port } = validateEnv();
await connectDB();

const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.INITIAL_ADMIN_PASSWORD;
if (email && password && !(await User.findOne({ email }))) {
  await User.create({
    name: "System Administrator",
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: "admin",
  });
  console.log(JSON.stringify({ level: "info", event: "bootstrap_admin_created" }));
} else if (!email || !password) {
  console.warn(JSON.stringify({ level: "warn", event: "bootstrap_admin_not_configured" }));
}

// Best-effort hourly retention worker. Expired Cloudinary assets are deleted before metadata.
const retentionTimer = setInterval(() => {
  void cleanupExpiredScreenshots().then(result => {
    if (result.deleted || result.failed) console.log(JSON.stringify({ level: result.failed ? "warn" : "info", event: "screenshot_retention_run", ...result }));
  }).catch(error => console.error(JSON.stringify({ level: "error", event: "screenshot_retention_worker_failed", errorName: error?.name || "Error" })));
}, 60 * 60 * 1000);
retentionTimer.unref();
void cleanupExpiredScreenshots().catch(error => console.error(JSON.stringify({ level: "error", event: "screenshot_retention_startup_failed", errorName: error?.name || "Error" })));

const server = app.listen(port, () => {
  console.log(JSON.stringify({ level: "info", event: "api_listening", port, environment: process.env.NODE_ENV || "development" }));
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", event: "shutdown_started", signal }));
  clearInterval(retentionTimer);
  const forceTimer = setTimeout(() => process.exit(1), 10000);
  forceTimer.unref();
  server.close(async (error) => {
    try {
      await mongoose.disconnect();
      if (error) {
        console.error(JSON.stringify({ level: "error", event: "http_server_close_failed", message: error.message }));
        process.exitCode = 1;
      }
    } catch (disconnectError) {
      console.error(JSON.stringify({ level: "error", event: "database_disconnect_failed", message: disconnectError.message }));
      process.exitCode = 1;
    } finally {
      clearTimeout(forceTimer);
      process.exit();
    }
  });
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
