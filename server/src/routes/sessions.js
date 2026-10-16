import { Router } from "express";
import WorkSession from "../models/WorkSession.js";
import Break from "../models/Break.js";
import { allowRoles } from "../middleware/auth.js";
import User from "../models/User.js";
import { writeAudit } from "../utils/audit.js";
import { isObjectId } from "../utils/userPolicy.js";
import { parseDateRange } from "../utils/dateRange.js";
import { closeOpenVisits } from "../utils/closeOpenVisits.js";
const r = Router();

const STALE_AFTER_MS = 15 * 60 * 1000;


// Review active sessions that have stopped sending heartbeats. This endpoint
// flags candidates for human review; it never silently ends a session.
r.get("/quality", allowRoles("admin", "manager"), async (req, res, next) => {
  try {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS);
    const filter = { status: "active", $or: [
      { lastHeartbeatAt: { $lt: cutoff } },
      { lastHeartbeatAt: null },
      { lastHeartbeatAt: { $exists: false }, startedAt: { $lt: cutoff } },
    ] };
    if (req.user.role === "manager") {
      const reports = await User.find({ managerId: req.user._id, role: "employee" }).select("_id").lean();
      filter.employeeId = { $in: reports.map((u) => u._id) };
    }
    const sessions = await WorkSession.find(filter)
      .populate("employeeId", "name email teamName managerId")
      .sort({ lastHeartbeatAt: 1, startedAt: 1 }).limit(200).lean();
    const sessionIds = sessions.map((s) => s._id);
    const activeBreaks = await Break.find({ sessionId: { $in: sessionIds }, status: "active" }).select("sessionId type startedAt").lean();
    const breakBySession = new Map(activeBreaks.map((b) => [String(b.sessionId), b]));
    res.json({ staleAfterMs: STALE_AFTER_MS, cutoff, sessions: sessions.map((s) => ({
      ...s,
      qualityFlags: [...new Set([...(s.qualityFlags || []), "STALE_HEARTBEAT"])],
      activeBreak: breakBySession.get(String(s._id)) || null,
    })) });
  } catch (e) { next(e); }
});

// Admins may explicitly recover a stale session after reviewing the employee
// and timestamps. It closes an open break first and records why the session ended.
r.post("/:id/recover-stale", allowRoles("admin"), async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid session ID" });
    const session = await WorkSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (session.status !== "active") return res.status(409).json({ message: "Session is already ended" });
    const heartbeat = session.lastHeartbeatAt || session.startedAt;
    if (Date.now() - new Date(heartbeat).getTime() < STALE_AFTER_MS) {
      return res.status(409).json({ message: "Session is not stale; refresh the list before recovery" });
    }
    const now = new Date();
    const activeBreak = await Break.findOne({ sessionId: session._id, status: "active" });
    if (activeBreak) {
      activeBreak.endedAt = now;
      activeBreak.status = "ended";
      await activeBreak.save();
    }
    session.endedAt = now;
    session.status = "ended";
    session.qualityFlags = [...new Set([...(session.qualityFlags || []), "STALE_HEARTBEAT", "ADMIN_RECOVERED_STALE_SESSION"])];
    await session.save();
    await closeOpenVisits(session, now);
    await writeAudit(req, { action: "STALE_SESSION_RECOVERED", targetType: "work_session", targetId: session.id, metadata: { employeeId: String(session.employeeId), closedActiveBreak: Boolean(activeBreak), qualityFlags: session.qualityFlags } });
    res.json({ session, closedBreak: activeBreak || null, message: "Stale session recovered and flagged for review" });
  } catch (e) { next(e); }
});
r.post("/", allowRoles("employee"), async (req, res, next) => {
  try {
    const existing = await WorkSession.findOne({
      employeeId: req.user.id,
      status: "active",
    });
    if (existing)
      return res
        .status(409)
        .json({
          message: "An active session already exists",
          session: existing,
        });
    const session = await WorkSession.create({
      employeeId: req.user.id,
      status: "active",
    });
    await writeAudit(req, { action: "WORK_SESSION_STARTED", targetType: "work_session", targetId: session.id, metadata: {} });
    res.status(201).json({ session });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ message: "An active session already exists" });
    next(e);
  }
});
r.get("/mine", allowRoles("employee"), async (req, res, next) => {
  try {
    const range = parseDateRange(req.query.from, req.query.to, { defaultDays: 30 });
    if (!range) return res.status(400).json({ message: "Invalid date range" });
    const { from, to } = range;
    const sessions = await WorkSession.find({
      employeeId: req.user.id,
      startedAt: { $lte: to },
      $or: [{ endedAt: null }, { endedAt: { $gte: from } }],
    }).sort({ startedAt: -1 }).limit(200).lean();
    const breaks = await Break.find({ sessionId: { $in: sessions.map((s) => s._id) } }).lean();
    const breakTotals = {};
    for (const b of breaks) {
      const start = Math.max(new Date(b.startedAt).getTime(), from.getTime());
      const end = Math.min(new Date(b.endedAt || Date.now()).getTime(), to.getTime(), Date.now());
      breakTotals[String(b.sessionId)] = (breakTotals[String(b.sessionId)] || 0) + Math.max(0, end - start);
    }
    const now = Date.now();
    res.json({ from, to, sessions: sessions.map((s) => {
      const start = Math.max(new Date(s.startedAt).getTime(), from.getTime());
      const end = Math.min(new Date(s.endedAt || now).getTime(), to.getTime(), now);
      return { ...s, _id: String(s._id), sessionMs: Math.max(0, end - start), breakMs: breakTotals[String(s._id)] || 0 };
    }) });
  } catch (e) { next(e); }
});
r.get("/current", allowRoles("employee"), async (req, res, next) => {
  try {
    const session = await WorkSession.findOne({
      employeeId: req.user.id,
      status: "active",
    }).sort({ startedAt: -1 });
    if (!session) return res.json({ session: null, activeBreak: null });
    res.json({
      session,
      activeBreak: await Break.findOne({
        sessionId: session.id,
        status: "active",
      }),
    });
  } catch (e) {
    next(e);
  }
});
r.post("/:id/heartbeat", async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid session ID" });
    const s = await WorkSession.findById(req.params.id);
    if (!s) return res.status(404).json({ message: "Session not found" });
    if (
      String(s.employeeId) !== String(req.user.id) &&
      req.user.role !== "admin"
    )
      return res.status(403).json({ message: "Forbidden" });
    if (s.status !== "active")
      return res.status(409).json({ message: "Session ended" });
    s.lastHeartbeatAt = new Date();
    await s.save();
    res.json({ lastHeartbeatAt: s.lastHeartbeatAt });
  } catch (e) {
    next(e);
  }
});
r.post("/:id/end", async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: "Invalid session ID" });
    const s = await WorkSession.findById(req.params.id);
    if (!s) return res.status(404).json({ message: "Session not found" });
    if (
      String(s.employeeId) !== String(req.user.id) &&
      req.user.role !== "admin"
    )
      return res.status(403).json({ message: "Forbidden" });
    if (s.status !== "active")
      return res.status(409).json({ message: "Session already ended" });
    const endedAt = new Date();
    const b = await Break.findOne({ sessionId: s.id, status: "active" });
    if (b) {
      b.endedAt = endedAt;
      b.status = "ended";
      await b.save();
    }
    s.endedAt = endedAt;
    s.status = "ended";
    await s.save();
    await closeOpenVisits(s, endedAt);
    await writeAudit(req, { action: "WORK_SESSION_ENDED", targetType: "work_session", targetId: s.id, metadata: { endedByAdmin: String(s.employeeId) !== String(req.user.id), closedActiveBreak: Boolean(b) } });
    res.json({ session: s, closedBreak: b || null });
  } catch (e) {
    next(e);
  }
});
export default r;
