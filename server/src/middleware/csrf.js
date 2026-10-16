const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function shouldRejectCookieMutation({ method, hasSessionCookie, fetchSite, origin, allowedOrigins = [] }) {
  if (SAFE_METHODS.has(String(method || "GET").toUpperCase()) || !hasSessionCookie) return false;
  if (String(fetchSite || "").toLowerCase() === "cross-site") return true;
  if (origin && !allowedOrigins.includes(origin)) return true;
  return false;
}

export function csrfProtection(req, res, next) {
  
const allowedOrigins = [
  ...(process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  ...(process.env.EXTENSION_ORIGIN
    ? [process.env.EXTENSION_ORIGIN.trim()]
    : []),
];

  const rejected = shouldRejectCookieMutation({
    method: req.method,
    hasSessionCookie: Boolean(req.cookies?.tracker_token),
    fetchSite: req.get("Sec-Fetch-Site"),
    origin: req.get("Origin"),
    allowedOrigins,
  });
  if (rejected) {
    return res.status(403).json({
      message: "Request rejected by CSRF protection. Reload the app and try again.",
      requestId: req.requestId,
    });
  }
  next();
}
