export const appRoutes = [
  { section: "Overview", path: "/dashboard", pageTitle: "Overview", description: "Workspace summary" },
  { section: "Attendance", path: "/sessions", aliases: ["/attendance"], pageTitle: "Sessions", description: "Recorded work sessions" },
  { section: "Breaks", path: "/breaks", pageTitle: "Breaks", description: "Recorded break intervals" },
  { section: "Activities", path: "/activities", pageTitle: "Activities", description: "Employee activity summary", managementOnly: true },
  { section: "Activity analytics", path: "/activity-analytics", pageTitle: "Activity analytics", description: "Website, idle, and tab activity details" },
  { section: "Break analytics", path: "/break-analytics", pageTitle: "Break analytics", description: "Employee break details", managementOnly: true },
  { section: "Screenshots", path: "/screenshots", pageTitle: "Screenshots", description: "Visible-tab screenshot review", managementOnly: true },
  { section: "Team & users", path: "/team-users", pageTitle: "Team & users", description: "Users and reporting relationships", managementOnly: true },
  { section: "Reports & policies", path: "/reports-policies", pageTitle: "Reports & policies", description: "Session and employee reports", managementOnly: true },
  { section: "Configuration", path: "/configuration", pageTitle: "Configuration", description: "Screenshot and idle policies", adminOnly: true },
  { section: "Session health", path: "/session-health", pageTitle: "Session health", description: "Stale-session diagnostics", managementOnly: true },
  { section: "Audit log", path: "/audit-log", pageTitle: "Audit log", description: "Administrative audit events", adminOnly: true },
];

export function pathForSection(section, employeeId = null) {
  const route = appRoutes.find((item) => item.section === section);
  const path = route?.path ?? "/dashboard";
  if (employeeId && (section === "Activity analytics" || section === "Break analytics")) {
    return `${path}/${encodeURIComponent(employeeId)}`;
  }
  return path;
}

export function parseRoutePath(pathname = typeof window !== "undefined" ? window.location.pathname : "/dashboard") {
  const parts = pathname.split("/").filter(Boolean);
  // Legacy /dashboard#section links are normalized by the controller's compatibility effect.
  const path = `/${parts[0] ?? "dashboard"}`;
  const route = appRoutes.find((item) => item.path === path || item.aliases?.includes(path));
  const section = route?.section ?? "Overview";
  const employeeId = (section === "Activity analytics" || section === "Break analytics") && parts[1]
    ? safeDecode(parts[1])
    : null;
  return { section, employeeId, notFound: !route && path !== "/" && path !== "/login" };
}

export function routeHashForSection(section, employeeId = null) {
  return pathForSection(section, employeeId);
}

export function parseRouteHash(hashValue) {
  const raw = (hashValue ?? (typeof window !== "undefined" ? window.location.hash : "")).replace(/^#/, "");
  const [rawRoute, rawEmployeeId] = raw.split("/");
  const legacyMap = {
    overview: "Overview", attendance: "Attendance", sessions: "Attendance",
    breaks: "Breaks", activities: "Activities", "activity-analytics": "Activity analytics",
    "break-analytics": "Break analytics", screenshots: "Screenshots", "team-users": "Team & users",
    "reports-policies": "Reports & policies", configuration: "Configuration",
    "screenshot-settings": "Configuration", "session-health": "Session health", "audit-log": "Audit log",
  };
  const section = legacyMap[safeDecode(rawRoute || "overview")] ?? "Overview";
  return {
    section,
    employeeId: (section === "Activity analytics" || section === "Break analytics") && rawEmployeeId
      ? safeDecode(rawEmployeeId)
      : null,
  };
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}
