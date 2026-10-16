export const appRoutes = [
    { section: "Overview", hash: "overview", pageTitle: "Overview", description: "Workspace summary" },
    { section: "Attendance", hash: "attendance", aliases: ["sessions"], pageTitle: "Sessions", description: "Recorded work sessions" },
    { section: "Breaks", hash: "breaks", pageTitle: "Breaks", description: "Recorded break intervals" },
    { section: "Activities", hash: "activities", pageTitle: "Activities", description: "Employee activity summary", managementOnly: true },
    { section: "Activity analytics", hash: "activity-analytics", pageTitle: "Activity analytics", description: "Website, idle, and tab activity details" },
    { section: "Break analytics", hash: "break-analytics", pageTitle: "Break analytics", description: "Employee break details", managementOnly: true },
    { section: "Screenshots", hash: "screenshots", pageTitle: "Screenshots", description: "Visible-tab screenshot review", managementOnly: true },
    { section: "Team & users", hash: "team-users", pageTitle: "Team & users", description: "Users and reporting relationships", managementOnly: true },
    { section: "Reports & policies", hash: "reports-policies", pageTitle: "Reports & policies", description: "Session and employee reports", managementOnly: true },
    { section: "Configuration", hash: "configuration", aliases: ["screenshot-settings"], pageTitle: "Configuration", description: "Screenshot and idle policies", adminOnly: true },
    { section: "Session health", hash: "session-health", pageTitle: "Session health", description: "Stale-session diagnostics", managementOnly: true },
    { section: "Audit log", hash: "audit-log", pageTitle: "Audit log", description: "Administrative audit events", adminOnly: true },
];
const sectionByHash = new Map();
for (const route of appRoutes) {
    sectionByHash.set(route.hash, route.section);
    for (const alias of route.aliases ?? [])
        sectionByHash.set(alias, route.section);
}
export function routeHashForSection(section, employeeId = null) {
    if ((section === "Activity analytics" || section === "Break analytics") && employeeId) {
        const route = appRoutes.find((item) => item.section === section);
        return `#${route?.hash ?? "overview"}/${encodeURIComponent(employeeId)}`;
    }
    return `#${appRoutes.find((item) => item.section === section)?.hash ?? "overview"}`;
}
export function parseRouteHash(hashValue) {
    const raw = (hashValue ?? (typeof window !== "undefined" ? window.location.hash : "")).replace(/^#/, "");
    const [rawRoute, rawEmployeeId] = raw.split("/");
    const route = safeDecode(rawRoute || "overview");
    if (route === "activity-analytics")
        return { section: "Activity analytics", employeeId: rawEmployeeId ? safeDecode(rawEmployeeId) : null };
    if (route === "break-analytics")
        return { section: "Break analytics", employeeId: rawEmployeeId ? safeDecode(rawEmployeeId) : null };
    return { section: sectionByHash.get(route) ?? "Overview", employeeId: null };
}
function safeDecode(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return value;
    }
}
