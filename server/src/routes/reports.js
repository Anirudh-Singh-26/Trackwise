import { Router } from "express";
import WorkSession from "../models/WorkSession.js";
import Break from "../models/Break.js";
import TrackingEvent from "../models/TrackingEvent.js";
import User from "../models/User.js";
import { allowRoles } from "../middleware/auth.js";
import { parseDateRange } from "../utils/dateRange.js";
const r = Router();
async function scope(user) {
  if (user.role === "admin") return null;
  if (user.role === "manager")
    return (await User.find({ managerId: user._id, role: "employee" }).select("_id")).map(
      (u) => u._id,
    );
  return [user._id];
}
r.get("/summary", allowRoles("admin", "manager"), async (req, res, next) => {
  try {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range) return res.status(400).json({ message: "Invalid date range" });
    const { from, to } = range;

    const ids = await scope(req.user);
    const peopleFilter = ids ? { _id: { $in: ids }, role: "employee" } : { role: "employee" };
    const [people, activePeople] = await Promise.all([
      User.countDocuments(peopleFilter),
      User.countDocuments({ ...peopleFilter, isActive: true }),
    ]);

    const sessionFilter = {
      startedAt: { $lte: to },
      $or: [{ endedAt: null }, { endedAt: { $gte: from } }],
    };
    if (ids) sessionFilter.employeeId = { $in: ids };
    const sessions = await WorkSession.find(sessionFilter).select("_id employeeId startedAt endedAt status").limit(5000);
    const sessionIds = sessions.map((item) => item._id);
    const breaks = sessionIds.length ? await Break.find({ sessionId: { $in: sessionIds } }).select("sessionId startedAt endedAt") : [];
    const breakTotals = new Map();
    for (const item of breaks) {
      const start = Math.max(new Date(item.startedAt).getTime(), from.getTime());
      const end = Math.min(new Date(item.endedAt || Date.now()).getTime(), to.getTime(), Date.now());
      const key = String(item.sessionId);
      breakTotals.set(key, (breakTotals.get(key) || 0) + Math.max(0, end - start));
    }
    let sessionMs = 0;
    for (const item of sessions) {
      const start = Math.max(new Date(item.startedAt).getTime(), from.getTime());
      const end = Math.min(new Date(item.endedAt || Date.now()).getTime(), to.getTime(), Date.now());
      sessionMs += Math.max(0, end - start);
    }
    const activeSessions = sessions.filter((item) => item.status === "active").length;
    const breakMs = [...breakTotals.values()].reduce((sum, value) => sum + value, 0);
    const eventFilter = { observedAt: { $gte: from, $lte: to } };
    if (ids) eventFilter.employeeId = { $in: ids };
    const websiteFilter = { ...eventFilter, type: { $in: ["VISIT_START", "DOMAIN_STATE_CHANGE"] } };
    const [websiteVisits, tabSwitches, domainGroups] = await Promise.all([
      TrackingEvent.countDocuments(websiteFilter),
      TrackingEvent.countDocuments({ ...eventFilter, type: "TAB_SWITCH" }),
      TrackingEvent.aggregate([
        { $match: websiteFilter },
        { $group: { _id: "$domain", events: { $sum: 1 } } },
        { $sort: { events: -1, _id: 1 } },
        { $limit: 5 },
      ]),
    ]);
    res.json({ from, to, people, activePeople, sessions: sessions.length, activeSessions, sessionMs, breakMs, websiteVisits, domainEvents: websiteVisits, tabSwitches, topDomains: domainGroups.map((item) => ({ domain: item._id, events: item.events })) });
  } catch (e) {
    next(e);
  }
});

r.get("/daily", allowRoles("admin", "manager"), async (req, res, next) => {
  try {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range) return res.status(400).json({ message: "Invalid date range" });
    const { from, to } = range;
    const ids = await scope(req.user);
    const filter = {
      startedAt: { $lte: to },
      $or: [{ endedAt: null }, { endedAt: { $gte: from } }],
    };
    if (ids) filter.employeeId = { $in: ids };
    const sessions = await WorkSession.find(filter)
      .populate("employeeId", "name email role teamName")
      .sort({ startedAt: -1 })
      .limit(1000);
    const breaks = await Break.find({ sessionId: { $in: sessions.map((s) => s._id) } });
    const totals = {};
    for (const b of breaks) {
      const start = Math.max(new Date(b.startedAt).getTime(), from.getTime());
      const end = Math.min(new Date(b.endedAt || Date.now()).getTime(), to.getTime(), Date.now());
      totals[String(b.sessionId)] = (totals[String(b.sessionId)] || 0) + Math.max(0, end - start);
    }
    res.json({
      from,
      to,
      rows: sessions.map((s) => {
        const start = Math.max(new Date(s.startedAt).getTime(), from.getTime());
        const end = Math.min(new Date(s.endedAt || Date.now()).getTime(), to.getTime(), Date.now());
        return {
          sessionId: s.id,
          employee: s.employeeId,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          status: s.status,
          sessionMs: Math.max(0, end - start),
          breakMs: totals[String(s._id)] || 0,
          qualityFlags: s.qualityFlags,
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});
r.get("/domains", allowRoles("admin", "manager"), async (req, res, next) => {
  try {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range) return res.status(400).json({ message: "Invalid date range" });
    const { from, to } = range;
    const ids = await scope(req.user);
    const filter = { observedAt: { $gte: from, $lte: to } };
    const requestedEmployeeId = typeof req.query.employeeId === "string" ? req.query.employeeId.trim() : "";
    if (requestedEmployeeId) {
      if (!/^[a-fA-F0-9]{24}$/.test(requestedEmployeeId)) return res.status(400).json({ message: "Invalid employeeId" });
      const employee = await User.findOne({ _id: requestedEmployeeId, role: "employee" }).select("_id").lean();
      if (!employee || (ids && !ids.some((id) => String(id) === requestedEmployeeId))) return res.status(404).json({ message: "Employee not found in your reporting scope" });
      filter.employeeId = employee._id;
    } else if (ids) filter.employeeId = { $in: ids };
    const inRange = await TrackingEvent.find(filter)
      .populate("employeeId", "name email role teamName")
      .sort({ observedAt: 1 })
      .limit(10000)
      .lean();
    const visitIds = [...new Set(inRange.filter(e => e.visitId).map(e => e.visitId))];
    const activityIds = [...new Set(inRange.filter(e => e.activityId).map(e => e.activityId))];
    const startFilter = { type: "VISIT_START", visitId: { $in: visitIds } };
    const idleStartFilter = { type: "IDLE_START", activityId: { $in: activityIds } };
    if (requestedEmployeeId) { startFilter.employeeId = requestedEmployeeId; idleStartFilter.employeeId = requestedEmployeeId; }
    else if (ids) { startFilter.employeeId = { $in: ids }; idleStartFilter.employeeId = { $in: ids }; }
    const [missingStarts, missingIdleStarts] = await Promise.all([
      visitIds.length ? TrackingEvent.find(startFilter).populate("employeeId", "name email role teamName").lean() : [],
      activityIds.length ? TrackingEvent.find(idleStartFilter).populate("employeeId", "name email role teamName").lean() : []
    ]);
    const byId = new Map([...missingStarts, ...missingIdleStarts, ...inRange].map(e => [String(e._id), e]));
    const events = [...byId.values()].sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt)).slice(-10000);
    res.json({ from, to, note: "Visit starts and ends are paired by visitId; open visits remain provisional.", events });
  } catch (e) {
    next(e);
  }
});

r.get("/people", allowRoles("admin", "manager"), async (req, res, next) => {
  try {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range) return res.status(400).json({ message: "Invalid date range" });
    const { from, to } = range;

    const ids = await scope(req.user);
    const peopleFilter = ids ? { _id: { $in: ids }, role: "employee" } : { role: "employee" };
    const people = await User.find(peopleFilter)
      .select("name email role teamName isActive managerId")
      .sort({ name: 1 })
      .limit(2000)
      .lean();
    const personIds = people.map((person) => person._id);
    if (!personIds.length) return res.json({ from, to, people: [] });

    const sessions = await WorkSession.find({
      employeeId: { $in: personIds },
      startedAt: { $lte: to },
      $or: [{ endedAt: null }, { endedAt: { $gte: from } }],
    }).select("_id employeeId startedAt endedAt status").limit(10000).lean();
    const sessionIds = sessions.map((session) => session._id);
    const breaks = sessionIds.length
      ? await Break.find({ sessionId: { $in: sessionIds } }).select("sessionId startedAt endedAt").lean()
      : [];
    const breakTotals = new Map();
    for (const item of breaks) {
      const start = Math.max(new Date(item.startedAt).getTime(), from.getTime());
      const end = Math.min(new Date(item.endedAt || Date.now()).getTime(), to.getTime(), Date.now());
      const key = String(item.sessionId);
      breakTotals.set(key, (breakTotals.get(key) || 0) + Math.max(0, end - start));
    }
    const totals = new Map();
    for (const session of sessions) {
      const key = String(session.employeeId);
      const row = totals.get(key) || { sessions: 0, activeSessions: 0, sessionMs: 0, breakMs: 0 };
      const start = Math.max(new Date(session.startedAt).getTime(), from.getTime());
      const end = Math.min(new Date(session.endedAt || Date.now()).getTime(), to.getTime(), Date.now());
      row.sessions += 1;
      if (session.status === "active") row.activeSessions += 1;
      row.sessionMs += Math.max(0, end - start);
      row.breakMs += breakTotals.get(String(session._id)) || 0;
      totals.set(key, row);
    }
    const eventCounts = await TrackingEvent.aggregate([
      { $match: { employeeId: { $in: personIds }, observedAt: { $gte: from, $lte: to } } },
      { $group: {
        _id: "$employeeId",
        domainEvents: { $sum: { $cond: [{ $in: ["$type", ["VISIT_START", "DOMAIN_STATE_CHANGE"]] }, 1, 0] } },
        tabSwitches: { $sum: { $cond: [{ $eq: ["$type", "TAB_SWITCH"] }, 1, 0] } },
        domains: { $addToSet: { $cond: [{ $in: ["$type", ["VISIT_START", "DOMAIN_STATE_CHANGE"]] }, "$domain", null] } },
      } },
    ]);
    const eventsByPerson = new Map(eventCounts.map((item) => [String(item._id), { domainEvents: item.domainEvents, tabSwitches: item.tabSwitches, uniqueDomains: item.domains.filter(Boolean).length }]));
    res.json({
      from,
      to,
      people: people.map((person) => {
        const key = String(person._id);
        return {
          id: key,
          name: person.name,
          email: person.email,
          role: person.role,
          teamName: person.teamName || "",
          isActive: person.isActive,
          ...(totals.get(key) || { sessions: 0, activeSessions: 0, sessionMs: 0, breakMs: 0 }),
          ...(eventsByPerson.get(key) || { domainEvents: 0, tabSwitches: 0, uniqueDomains: 0 }),
        };
      }),
    });
  } catch (e) { next(e); }
});

export default r;
