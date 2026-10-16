export function isValidDomain(domain) {
  return (
    typeof domain === "string" &&
    domain.length <= 253 &&
    /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i.test(domain) &&
    !domain.toLowerCase().includes("localhost")
  );
}

export function validateTrackingEvent(event, now = Date.now()) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return "Invalid event";
  if (typeof event.eventId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(event.eventId)) return "Invalid event ID";
  if (!isValidDomain(event.domain)) return "Invalid domain";
  const supportedTypes = ["DOMAIN_STATE_CHANGE", "VISIT_START", "VISIT_END", "IDLE_START", "IDLE_END", "TAB_SWITCH"];
  if (event.schemaVersion !== 1 || !supportedTypes.includes(event.type)) return "Unsupported event schema or type";
  if (typeof event.observedAt !== "string") return "Invalid timestamp";
  const timestamp = new Date(event.observedAt);
  if (Number.isNaN(timestamp.getTime())) return "Invalid timestamp";
  if (timestamp.getTime() > now + 120000 || timestamp.getTime() < now - 86400000) return "Timestamp outside accepted window";
  if (typeof event.sessionId !== "string" || !/^[a-f0-9]{24}$/i.test(event.sessionId)) return "Invalid session ID";
  if (event.type === "VISIT_START" || event.type === "VISIT_END") {
    if (typeof event.visitId !== "string" || !/^[a-f0-9-]{36}$/i.test(event.visitId)) return "Invalid visit ID";
    if (!Number.isSafeInteger(event.tabId) || event.tabId < 0) return "Invalid tab ID";
  }
  if (event.type === "TAB_SWITCH") {
    if (!Number.isSafeInteger(event.tabId) || event.tabId < 0) return "Invalid tab ID";
    if (event.previousDomain != null && !isValidDomain(event.previousDomain)) return "Invalid previous domain";
  }
  if (event.type === "IDLE_START" || event.type === "IDLE_END") {
    if (typeof event.activityId !== "string" || !/^[a-f0-9-]{36}$/i.test(event.activityId)) return "Invalid activity ID";
  }
  return null;
}
