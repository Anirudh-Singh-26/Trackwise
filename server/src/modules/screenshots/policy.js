export const DEFAULT_SCREENSHOT_POLICY = Object.freeze({
  enabled: true,
  intervalSeconds: 30,
  idleThresholdSeconds: 60,
  captureScope: "visible-tab",
  pauseDuringIdle: true,
  pauseDuringBreaks: true,
  retentionDays: 7,
  excludedDomains: [],
});

export function validatePolicy(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Policy must be an object";
  if (typeof input.enabled !== "boolean") return "enabled must be a boolean";
  if (!Number.isInteger(input.intervalSeconds) || input.intervalSeconds < 30 || input.intervalSeconds > 300) return "intervalSeconds must be an integer between 30 and 300";
  if (!Number.isInteger(input.idleThresholdSeconds) || input.idleThresholdSeconds < 30 || input.idleThresholdSeconds > 300) return "idleThresholdSeconds must be an integer between 30 and 300";
  if (input.captureScope !== "visible-tab") return "captureScope must be visible-tab";
  if (typeof input.pauseDuringIdle !== "boolean" || typeof input.pauseDuringBreaks !== "boolean") return "Pause settings must be booleans";
  if (!Number.isInteger(input.retentionDays) || input.retentionDays < 1 || input.retentionDays > 30) return "retentionDays must be an integer between 1 and 30";
  if (input.excludedDomains !== undefined && (!Array.isArray(input.excludedDomains) || input.excludedDomains.length > 200 || input.excludedDomains.some(d => typeof d !== "string" || d.length > 253 || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(d)))) return "excludedDomains must be a list of valid domain names";
  return null;
}
