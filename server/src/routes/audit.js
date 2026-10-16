import { Router } from "express";
import AuditLog from "../models/AuditLog.js";
import { allowRoles } from "../middleware/auth.js";
import { parseDateRange } from "../utils/dateRange.js";

const r = Router();
r.get("/", allowRoles("admin"), async (req, res, next) => {
  try {
    const limitRaw = Number.parseInt(req.query.limit || "100", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(250, Math.max(1, limitRaw)) : 100;
    const filter = {};
    if (req.query.action) filter.action = String(req.query.action).slice(0, 80);
    if (req.query.targetType) filter.targetType = String(req.query.targetType).slice(0, 80);
    if (req.query.from || req.query.to) {
      const range = parseDateRange(req.query.from, req.query.to, { defaultFrom: new Date(0) });
      if (!range) return res.status(400).json({ message: "Invalid date range" });
      filter.occurredAt = { $gte: range.from, $lte: range.to };
    }
    const logs = await AuditLog.find(filter)
      .populate("actorId", "name email role")
      .sort({ occurredAt: -1, _id: -1 })
      .limit(limit)
      .lean();
    res.json({ logs, limit });
  } catch (error) { next(error); }
});
export default r;
