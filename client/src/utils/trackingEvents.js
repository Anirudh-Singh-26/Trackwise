export function toVisitRows(rawEvents) {
    // Pair by visitId after collecting all events. Do not rely on event order:
    // the extension can enqueue VISIT_END just before the next VISIT_START, and
    // timestamps can be equal within the same millisecond/second.
    const visits = new Map();
    const ends = new Map();
    const idleStarts = new Map();
    const idleEnds = new Map();
    const legacy = [];
    for (const event of rawEvents) {
        if (event.type === "TAB_SWITCH") {
            legacy.push({ _id: String(event._id || event.eventId), domain: event.domain, previousDomain: event.previousDomain || null, startedAt: event.observedAt, endedAt: event.observedAt, durationMs: 0, employeeId: event.employeeId, sessionId: String(event.sessionId), type: "TAB_SWITCH" });
            continue;
        }
        if (event.type === "IDLE_START" || event.type === "IDLE_END") {
            if (!event.activityId)
                continue;
            const key = `${event.sessionId}:${event.activityId}`;
            if (event.type === "IDLE_START")
                idleStarts.set(key, event);
            else
                idleEnds.set(key, event);
            continue;
        }
        if (event.type === "DOMAIN_STATE_CHANGE" || !event.visitId) {
            legacy.push({
                _id: String(event._id || event.eventId),
                domain: event.domain,
                startedAt: event.observedAt,
                endedAt: null,
                durationMs: null,
                employeeId: event.employeeId,
                sessionId: String(event.sessionId),
                type: "LEGACY_EVENT",
            });
            continue;
        }
        const key = `${event.sessionId}:${event.visitId}`;
        if (event.type === "VISIT_START") {
            visits.set(key, {
                _id: key,
                visitId: event.visitId,
                domain: event.domain,
                startedAt: event.observedAt,
                endedAt: null,
                durationMs: null,
                employeeId: event.employeeId,
                sessionId: String(event.sessionId),
                type: "VISIT",
            });
        }
        else if (event.type === "VISIT_END") {
            ends.set(key, event);
        }
    }
    for (const [key, endEvent] of ends) {
        const visit = visits.get(key);
        if (visit) {
            visit.endedAt = endEvent.observedAt;
            visit.durationMs = Math.max(0, new Date(endEvent.observedAt).getTime() - new Date(visit.startedAt).getTime());
        }
        else {
            // The selected date range may include an end but exclude its start.
            legacy.push({
                _id: `${key}:end`,
                domain: endEvent.domain,
                startedAt: endEvent.observedAt,
                endedAt: endEvent.observedAt,
                durationMs: 0,
                employeeId: endEvent.employeeId,
                sessionId: String(endEvent.sessionId),
                type: "VISIT_END_ONLY",
            });
        }
    }
    for (const [key, startEvent] of idleStarts) {
        const endEvent = idleEnds.get(key);
        const endedAt = endEvent?.observedAt || null;
        legacy.push({
            _id: `${key}:idle`,
            domain: "System idle",
            startedAt: startEvent.observedAt,
            endedAt,
            durationMs: Math.max(0, new Date(endedAt || new Date().toISOString()).getTime() - new Date(startEvent.observedAt).getTime()),
            employeeId: startEvent.employeeId,
            sessionId: String(startEvent.sessionId),
            activityId: startEvent.activityId,
            type: "IDLE_PERIOD",
        });
    }
    // If the range includes an idle end but its start was outside the range, retain a point-in-time row.
    for (const [key, endEvent] of idleEnds) {
        if (!idleStarts.has(key))
            legacy.push({
                _id: `${key}:idle-end`, domain: "System idle", startedAt: endEvent.observedAt,
                endedAt: endEvent.observedAt, durationMs: 0, employeeId: endEvent.employeeId,
                sessionId: String(endEvent.sessionId), activityId: endEvent.activityId, type: "IDLE_PERIOD",
            });
    }
    const now = Date.now();
    for (const visit of visits.values()) {
        if (!visit.endedAt) {
            visit.durationMs = Math.max(0, now - new Date(visit.startedAt).getTime());
        }
    }
    return [...visits.values(), ...legacy].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}
