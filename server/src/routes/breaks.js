import { Router } from "express";
import WorkSession from "../models/WorkSession.js";
import Break from "../models/Break.js";
import User from "../models/User.js";
import { parseDateRange } from "../utils/dateRange.js";
import { allowRoles } from "../middleware/auth.js";
import { closeOpenVisits } from "../utils/closeOpenVisits.js";
const r = Router(),
  types = ["lunch", "short_break", "personal", "other"];

r.get("/breaks/report", async (req, res, next) => {
  try {
    const range = parseDateRange(req.query.from, req.query.to, { defaultDays: 7 });
    if (!range) return res.status(400).json({ message: "Invalid date range" });
    const { from, to } = range;
    let employeeIds = null;
    if (req.user.role === "employee") employeeIds = [req.user._id];
    else if (req.user.role === "manager") {
      employeeIds = (await User.find({ managerId: req.user._id, role: "employee" }).select("_id").lean()).map((u) => u._id);
    }
    const sessionFilter = { startedAt: { $lte: to }, $or: [{ endedAt: null }, { endedAt: { $gte: from } }] };
    if (employeeIds) sessionFilter.employeeId = { $in: employeeIds };
    const sessions = await WorkSession.find(sessionFilter).select("_id employeeId startedAt endedAt status").lean();
    const sessionIds = sessions.map((session) => session._id);
    if (!sessionIds.length) return res.json({ from, to, breaks: [] });
    const sessionById = new Map(sessions.map((session) => [String(session._id), session]));
    const breaks = await Break.find({ sessionId: { $in: sessionIds }, startedAt: { $lte: to }, $or: [{ endedAt: null }, { endedAt: { $gte: from } }] })
      .populate("employeeId", "name email teamName")
      .sort({ startedAt: -1 }).limit(5000).lean();
    const now = Date.now();
    res.json({ from, to, breaks: breaks.map((item) => {
      const start = Math.max(new Date(item.startedAt).getTime(), from.getTime());
      const end = Math.min(new Date(item.endedAt || now).getTime(), to.getTime(), now);
      return { ...item, session: sessionById.get(String(item.sessionId)) || null, durationMs: Math.max(0, end - start) };
    }) });
  } catch (e) { next(e); }
});

r.post(
  "/sessions/:id/breaks",
  allowRoles("employee"),
  async (req, res, next) => {
    try {
      const s = await WorkSession.findOne({
        _id: req.params.id,
        employeeId: req.user.id,
        status: "active",
      });
      if (!s)
        return res.status(404).json({ message: "Active session not found" });
      if (await Break.findOne({ sessionId: s.id, status: "active" }))
        return res.status(409).json({ message: "A break is already active" });
      if (!types.includes(req.body?.type))
        return res
          .status(400)
          .json({ message: `Break type must be one of ${types.join(", ")}` });
      const b = await Break.create({
        employeeId: req.user.id,
        sessionId: s.id,
        type: req.body.type,
        status: "active",
      });
      await closeOpenVisits(s, b.startedAt || new Date());
      res.status(201).json({ break: b });
    } catch (e) {
      if (e?.code === 11000) return res.status(409).json({ message: "A break is already active" });
      next(e);
    }
  },
);
r.post("/breaks/:id/end", allowRoles("employee"), async (req, res, next) => {
  try {
    const b = await Break.findOne({
      _id: req.params.id,
      employeeId: req.user.id,
      status: "active",
    });
    if (!b) return res.status(404).json({ message: "Active break not found" });
    b.endedAt = new Date();
    b.status = "ended";
    await b.save();
    res.json({ break: b });
  } catch (e) {
    next(e);
  }
});
export default r;
