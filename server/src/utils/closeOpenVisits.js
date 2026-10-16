import { randomUUID } from "node:crypto";
import TrackingEvent from "../models/TrackingEvent.js";

// Finalize any visit or idle interval still open when a work session ends.
export async function closeOpenVisits(session, endedAt = new Date()) {
  const starts = await TrackingEvent.find({ sessionId: session._id, type: "VISIT_START" })
    .select("visitId tabId domain")
    .lean();
  const visitIds = [...new Set(starts.map(item => item.visitId).filter(Boolean))];
  let closedVisits = 0;
  if (visitIds.length) {
    const ended = await TrackingEvent.find({ sessionId: session._id, type: "VISIT_END", visitId: { $in: visitIds } }).distinct("visitId");
    const endedSet = new Set(ended);
    const openStarts = starts.filter(item => item.visitId && !endedSet.has(item.visitId));
    if (openStarts.length) {
      await TrackingEvent.insertMany(openStarts.map(item => ({
        eventId: randomUUID(), schemaVersion: 1, source: "chrome_extension",
        employeeId: session.employeeId, sessionId: session._id, type: "VISIT_END",
        visitId: item.visitId, tabId: item.tabId, domain: item.domain, observedAt: endedAt
      })), { ordered: false });
      closedVisits = openStarts.length;
    }
  }

  const idleStarts = await TrackingEvent.find({ sessionId: session._id, type: "IDLE_START" })
    .select("activityId")
    .lean();
  const activityIds = [...new Set(idleStarts.map(item => item.activityId).filter(Boolean))];
  let closedIdle = 0;
  if (activityIds.length) {
    const idleEnds = await TrackingEvent.find({ sessionId: session._id, type: "IDLE_END", activityId: { $in: activityIds } }).distinct("activityId");
    const idleEndSet = new Set(idleEnds);
    const openIdle = idleStarts.filter(item => item.activityId && !idleEndSet.has(item.activityId));
    if (openIdle.length) {
      await TrackingEvent.insertMany(openIdle.map(item => ({
        eventId: randomUUID(), schemaVersion: 1, source: "chrome_extension",
        employeeId: session.employeeId, sessionId: session._id, type: "IDLE_END",
        activityId: item.activityId, domain: "system.activity", observedAt: endedAt
      })), { ordered: false });
      closedIdle = openIdle.length;
    }
  }
  return closedVisits + closedIdle;
}
