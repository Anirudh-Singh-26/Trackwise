import { Router } from "express";
import TrackingEvent from "../models/TrackingEvent.js";
import WorkSession from "../models/WorkSession.js";
import Break from "../models/Break.js";
import { validateTrackingEvent } from "../utils/trackingValidation.js";
import { parseDateRange } from "../utils/dateRange.js";
const r = Router();
r.get("/events/mine", async (req, res, next) => {
  try {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range) return res.status(400).json({ message: "Invalid date range" });
    const { from, to } = range;
    const inRange = await TrackingEvent.find({ employeeId: req.user._id, observedAt: { $gte: from, $lte: to } })
      .sort({ observedAt: -1 }).limit(5000).lean();
    const visitIds = [...new Set(inRange.filter(e => e.visitId).map(e => e.visitId))];
    const activityIds = [...new Set(inRange.filter(e => e.activityId).map(e => e.activityId))];
    const [missingStarts, missingIdleStarts] = await Promise.all([
      visitIds.length ? TrackingEvent.find({ employeeId: req.user._id, visitId: { $in: visitIds }, type: "VISIT_START" }).lean() : [],
      activityIds.length ? TrackingEvent.find({ employeeId: req.user._id, activityId: { $in: activityIds }, type: "IDLE_START" }).lean() : []
    ]);
    const byId = new Map([...missingStarts, ...missingIdleStarts, ...inRange].map(e => [String(e._id), e]));
    const events = [...byId.values()].sort((a, b) => new Date(b.observedAt) - new Date(a.observedAt)).slice(0, 5000);
    res.json({ from, to, events });
  } catch (e) { next(e); }
});

// The extension token can only heartbeat the single session it was issued for.
r.post("/heartbeat", async (req, res, next) => {
  try {
    const sessionId = req.extensionSessionId;
    if (!sessionId) return res.status(403).json({ message: "Extension session binding missing" });
    const session = await WorkSession.findOne({ _id: sessionId, employeeId: req.user.id, status: "active" });
    if (!session) return res.status(409).json({ message: "Bound work session is no longer active. Reconnect after starting a new session." });
    const activeBreak = await Break.findOne({ sessionId: session._id, status: "active" }).select("_id type startedAt").lean();
    session.lastHeartbeatAt = new Date();
    const reportedState = ["active", "idle", "locked"].includes(req.body?.browserState) ? req.body.browserState : "unknown";
    session.browserState = reportedState;
    session.browserStateUpdatedAt = new Date();
    await session.save();
    res.json({ ok: true, sessionId: String(session._id), lastHeartbeatAt: session.lastHeartbeatAt, breakActive: Boolean(activeBreak), activeBreak: activeBreak || null });
  } catch (e) { next(e); }
});

r.post("/events/batch", async (req, res, next) => {
  try {
    const events = req.body?.events;
    if (!Array.isArray(events) || events.length < 1 || events.length > 100)
      return res
        .status(400)
        .json({ message: "events must contain 1-100 items" });
    const accepted = [],
      rejected = [];
    for (const e of events) {
      try {
        const validationError = validateTrackingEvent(e);
        if (validationError) {
          rejected.push({ eventId: typeof e?.eventId === "string" ? e.eventId.slice(0, 128) : null, reason: validationError });
          continue;
        }
        const at = new Date(e.observedAt);
        const boundSessionId = req.extensionSessionId || null;
        if (boundSessionId && String(e.sessionId) !== String(boundSessionId)) {
          rejected.push({ eventId: e.eventId, reason: "Event session does not match extension token" });
          continue;
        }
        const s = await WorkSession.findById(e.sessionId);
        if (
          !s ||
          s.status !== "active" ||
          String(s.employeeId) !== String(req.user.id)
        ) {
          rejected.push({
            eventId: e.eventId,
            reason: "Invalid/inactive session",
          });
          continue;
        }
        if (await Break.findOne({ sessionId: s.id, status: "active" })) {
          rejected.push({ eventId: e.eventId, reason: "Break is active" });
          continue;
        }
        if (
          at.getTime() > Date.now() + 120000 ||
          at.getTime() < Date.now() - 86400000
        ) {
          rejected.push({
            eventId: e.eventId,
            reason: "Timestamp outside accepted window",
          });
          continue;
        }
        const existingEvent = await TrackingEvent.findOne({ eventId: e.eventId }).select("employeeId sessionId").lean();
        if (existingEvent) {
          if (String(existingEvent.employeeId) === String(req.user.id) && String(existingEvent.sessionId) === String(s.id)) {
            accepted.push(e.eventId); // Idempotent retry of an already accepted event.
          } else {
            rejected.push({ eventId: e.eventId, reason: "Event ID already belongs to another record" });
          }
          continue;
        }
        await TrackingEvent.create({
          eventId: e.eventId,
          schemaVersion: 1,
          source: "chrome_extension",
          employeeId: req.user.id,
          sessionId: s.id,
          type: e.type,
          visitId: e.visitId || null,
          activityId: e.activityId || null,
          tabId: Number.isSafeInteger(e.tabId) ? e.tabId : null,
          previousDomain: e.previousDomain || null,
          domain: e.domain.toLowerCase(),
          observedAt: at,
        });
        accepted.push(e.eventId);
      } catch (err) {
        if (err.code === 11000) {
          const existingEvent = await TrackingEvent.findOne({ eventId: e.eventId }).select("employeeId sessionId").lean();
          if (existingEvent && String(existingEvent.employeeId) === String(req.user.id) && String(existingEvent.sessionId) === String(e.sessionId)) accepted.push(e.eventId);
          else rejected.push({ eventId: e.eventId, reason: "Event ID collision" });
        } else rejected.push({ eventId: e.eventId || null, reason: "Could not process" });
      }
    }
    res
      .status(202)
      .json({
        acceptedCount: accepted.length,
        acceptedEventIds: accepted,
        rejected,
      });
  } catch (e) {
    next(e);
  }
});
export default r;
