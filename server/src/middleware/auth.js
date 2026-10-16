import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function requireAuth(req, res, next) {
  try {
    const authHeader = String(req.headers.authorization || "");
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);

    const isExtensionAction =
      ((req.method === "POST" && /^\/api\/v1\/tracking\/(?:events\/batch|heartbeat)(?:\?.*)?$/.test(req.originalUrl)) ||
       (req.method === "GET" && /^\/api\/v1\/screenshots\/policy(?:\?.*)?$/.test(req.originalUrl)) ||
       (req.method === "POST" && /^\/api\/v1\/screenshots(?:\?.*)?$/.test(req.originalUrl)));

    let token;
    let extensionUpload = false;

    // Tracking endpoints must use the extension's scoped Bearer token,
    // even when a dashboard cookie is also present.
    if (isExtensionAction && bearerMatch) {
      token = bearerMatch[1].trim();
      extensionUpload = true;
    } else {
      token = req.cookies?.tracker_token;

      if (!token && bearerMatch) {
        if (!isExtensionAction) {
          return res.status(403).json({
            message:
              "Extension token is restricted to approved extension tracking and screenshot endpoints",
            requestId: req.requestId,
          });
        }

        token = bearerMatch[1].trim();
        extensionUpload = true;
      }
    }

    if (!token) {
      return res.status(401).json({
        message: "Authentication required",
        requestId: req.requestId,
      });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (
      extensionUpload &&
      (payload.scope !== "tracking:write" || !payload.sessionId)
    ) {
      return res.status(403).json({
        message: "Invalid extension token scope",
        requestId: req.requestId,
      });
    }

    const user = await User.findById(payload.sub);

    if (!user || !user.isActive) {
      return res.status(401).json({
        message: "Account unavailable",
        requestId: req.requestId,
      });
    }

    if (extensionUpload) {
      if (user.role !== "employee") {
        return res.status(403).json({
          message: "Only employees can upload tracking events",
          requestId: req.requestId,
        });
      }

      req.extensionSessionId = payload.sessionId;
    }

    req.user = user;
    next();
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "auth_invalid",
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        reason: error?.name || "unknown",
      }),
    );

    return res.status(401).json({
      message: "Invalid or expired session",
      requestId: req.requestId,
    });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) =>
    req.user && roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ message: "Insufficient permissions" });
}
