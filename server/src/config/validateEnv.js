const PLACEHOLDER_SECRET = /^(replace_with_|change_me|your_)/i;
const PLACEHOLDER_PASSWORD = /^(change.?this|replace.?with|your.?password|password123)/i;

export function validateEnv(env = process.env) {
  const errors = [];
  const isProduction = env.NODE_ENV === "production";
  const port = Number(env.PORT || 5000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("PORT must be an integer between 1 and 65535");
  }
  if (!env.MONGODB_URI?.trim()) errors.push("MONGODB_URI is required");
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || PLACEHOLDER_SECRET.test(env.JWT_SECRET)) {
    errors.push("JWT_SECRET must be a unique, non-placeholder secret of at least 32 characters");
  }
  if (!env.CLIENT_ORIGIN?.trim()) errors.push("CLIENT_ORIGIN is required");

  if (env.INITIAL_ADMIN_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.INITIAL_ADMIN_EMAIL.trim())) {
    errors.push("INITIAL_ADMIN_EMAIL must be a valid email address");
  }
  if (Boolean(env.INITIAL_ADMIN_EMAIL) !== Boolean(env.INITIAL_ADMIN_PASSWORD)) {
    errors.push("INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD must be configured together");
  }
  if (env.INITIAL_ADMIN_PASSWORD && env.INITIAL_ADMIN_PASSWORD.length < 12) {
    errors.push("INITIAL_ADMIN_PASSWORD must be at least 12 characters");
  }
  if (env.INITIAL_ADMIN_PASSWORD && PLACEHOLDER_PASSWORD.test(env.INITIAL_ADMIN_PASSWORD)) {
    errors.push("INITIAL_ADMIN_PASSWORD must not be an example or placeholder password");
  }
  if (env.COOKIE_SECURE && !["true", "false"].includes(env.COOKIE_SECURE)) {
    errors.push("COOKIE_SECURE must be either true or false");
  }

  if (isProduction) {
    if (env.COOKIE_SECURE !== "true") errors.push("COOKIE_SECURE=true is required in production (HTTPS)");
    const origins = env.CLIENT_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean);
    if (origins.some((origin) => !origin.startsWith("https://"))) {
      errors.push("Every CLIENT_ORIGIN must use HTTPS in production");
    }
    if (!env.MONGODB_URI?.startsWith("mongodb+srv://") && !env.MONGODB_URI?.startsWith("mongodb://")) {
      errors.push("MONGODB_URI must be a MongoDB connection URI");
    }
  }

  if (errors.length) {
    const error = new Error(`Invalid environment configuration:\n- ${errors.join("\n- ")}`);
    error.name = "EnvironmentValidationError";
    error.details = errors;
    throw error;
  }
  return { port, isProduction };
}
