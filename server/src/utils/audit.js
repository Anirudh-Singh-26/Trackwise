import AuditLog from "../models/AuditLog.js";

// Only pass explicitly selected, non-secret metadata to this helper.
// Audit failures must not silently disappear, but should not turn a successful
// business mutation into a misleading client-side failure after it committed.
export async function writeAudit(req, { action, targetType, targetId = null, metadata = {} }) {
  try {
    await AuditLog.create({
      actorId: req.user?._id || null,
      actorRole: req.user?.role || "system",
      action,
      targetType,
      targetId: targetId == null ? null : String(targetId),
      metadata,
      requestId: req.requestId || null,
      occurredAt: new Date(),
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "audit_write_failed",
      requestId: req.requestId || null,
      action,
      targetType,
      errorName: error?.name || "Error",
    }));
  }
}
