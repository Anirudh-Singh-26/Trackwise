import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, Clock3, Coffee, ShieldCheck, Users, RefreshCw, Plus, Download, CalendarDays, AlertTriangle, ChartNoAxesCombined, ArrowLeft, Search, Info, Settings, Camera, Gauge } from "lucide-react";
import { api } from "../services/api";
import { fetchCurrentUser, loginRequest, logoutRequest } from "../services/authService";
import { deleteScreenshotRequest, fetchScreenshotAccess, fetchScreenshotPolicy, fetchScreenshots, updateScreenshotPolicy } from "../services/screenshotService";
import { fetchUsers } from "../services/userService";
import { fetchCurrentSession, fetchMySessions, fetchSessionQuality } from "../services/sessionService";
import { fetchBreakReport, fetchDailyReport, fetchEmployeeDomainEvents, fetchMyTrackingEvents, fetchPeopleReport, fetchReportSummary } from "../services/reportService";
import { fetchAuditLogs } from "../services/auditService";
import { dateLabel, duration, today, dateInputValue } from "../utils/dateTime";
import { toVisitRows } from "../utils/trackingEvents";
import { parseRoutePath, parseRouteHash, pathForSection } from "../utils/routes";
import { Filters } from "../components/common/Filters";
import { Empty } from "../components/common/EmptyState";
import ActivityAnalyticsSection from "../components/pages/ActivityAnalyticsSection";
import { buildDailyActivity, buildDomainActivity } from "../components/charts/ActivityCharts";
export function useTrackwiseController() {
    const location = useLocation();
    const navigate = useNavigate();
    const syncingFromUrl = useRef(false);
    const initialRoute = parseRoutePath(location.pathname);
    const [user, setUser] = useState(null);
    const [email, setEmail] = useState("admin@example.com");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [loginError, setLoginError] = useState("");
    const [selectedEmployeeId, setSelectedEmployeeId] = useState(initialRoute.employeeId);
    const [activitySearch, setActivitySearch] = useState("");
    const [chartMode, setChartMode] = useState("time");
    const [idleChartMode, setIdleChartMode] = useState("time");
    const [domainFilter, setDomainFilter] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [section, setSection] = useState(initialRoute.section);
    const [activityFilter, setActivityFilter] = useState("all");
    const [refreshingSection, setRefreshingSection] = useState(null);
    const [session, setSession] = useState(null);
    const [activeBreak, setActiveBreak] = useState(null);
    const [breakRecords, setBreakRecords] = useState([]);
    const [dashboardSummary, setDashboardSummary] = useState(null);
    const [peopleSummary, setPeopleSummary] = useState([]);
    const [sessionHistory, setSessionHistory] = useState([]);
    const [users, setUsers] = useState([]);
    const [rows, setRows] = useState([]);
    const [events, setEvents] = useState([]);
    const [qualitySessions, setQualitySessions] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [from, setFrom] = useState(dateInputValue(new Date(Date.now() - 7 * 86400000)));
    const [to, setTo] = useState(today());
    const [editingUserId, setEditingUserId] = useState(null);
    const [editName, setEditName] = useState("");
    const [editEmail, setEditEmail] = useState("");
    const [editRole, setEditRole] = useState("employee");
    const [editTeam, setEditTeam] = useState("");
    const [editManagerId, setEditManagerId] = useState("");
    const [newName, setNewName] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [newRole, setNewRole] = useState("employee");
    const [newTeam, setNewTeam] = useState("");
    const [newManagerId, setNewManagerId] = useState("");
    const [screenshotPolicy, setScreenshotPolicy] = useState({ enabled: true, intervalSeconds: 30, idleThresholdSeconds: 60, captureScope: "visible-tab", pauseDuringIdle: true, pauseDuringBreaks: true, retentionDays: 7, excludedDomains: [] });
    const [screenshotEmployeeId, setScreenshotEmployeeId] = useState("");
    const [screenshotRows, setScreenshotRows] = useState([]);
    const [analyticsScreenshotRows, setAnalyticsScreenshotRows] = useState([]);
    const [reportPage, setReportPage] = useState(1);
    const [reportPageSize, setReportPageSize] = useState(10);
    const [screenshotTotal, setScreenshotTotal] = useState(0);
    const [screenshotPage, setScreenshotPage] = useState(1);
    const [screenshotImageUrl, setScreenshotImageUrl] = useState("");
    const [screenshotImageLabel, setScreenshotImageLabel] = useState("");
    const [excludedDomainsText, setExcludedDomainsText] = useState("");
    const loadCurrent = useCallback(async (currentUser) => {
        if (currentUser.role === "employee") {
            const [data, history] = await Promise.all([fetchCurrentSession(), fetchMySessions()]);
            setSession(data.session);
            setActiveBreak(data.activeBreak);
            setSessionHistory(history.sessions);
        }
        else {
            setSession(null);
            setActiveBreak(null);
            setSessionHistory([]);
        }
    }, []);
    const loadSection = useCallback(async (target = section, currentUser = user) => {
        if (!currentUser)
            return;
        try {
            if ((target === "Team & users" || target === "Screenshots") && (currentUser.role === "admin" || currentUser.role === "manager")) {
                const d = await fetchUsers();
                setUsers(d.users);
            }
            if (target === "Session health" && currentUser.role !== "employee") {
                const d = await fetchSessionQuality();
                setQualitySessions(d.sessions);
            }
            if (target === "Audit log" && currentUser.role === "admin") {
                const d = await fetchAuditLogs(150);
                setAuditLogs(d.logs);
            }
            if ((target === "Configuration" || target === "Screenshots" || target === "Overview" || target === "Activity analytics") && currentUser.role !== "employee") {
                const policyData = await fetchScreenshotPolicy();
                setScreenshotPolicy(policyData.policy);
                setExcludedDomainsText((policyData.policy.excludedDomains || []).join("\n"));
                if (target === "Screenshots") {
                    if (screenshotEmployeeId) {
                        const d = await fetchScreenshots(screenshotEmployeeId, screenshotPage, 30);
                        setScreenshotRows(d.screenshots);
                        setScreenshotTotal(d.total);
                    }
                    else {
                        setScreenshotRows([]);
                        setScreenshotTotal(0);
                    }
                }
            }
            if (target === "Overview" && currentUser.role !== "employee") {
                const q = `?from=${encodeURIComponent(new Date(`${from}T00:00:00`).toISOString())}&to=${encodeURIComponent(new Date(`${to}T23:59:59.999`).toISOString())}`;
                const [d, peopleData] = await Promise.all([fetchReportSummary(q), fetchPeopleReport(q)]);
                setDashboardSummary(d);
                setPeopleSummary(peopleData.people);
            }
            if (target === "Breaks" || target === "Break analytics") {
                const q = `?from=${encodeURIComponent(new Date(`${from}T00:00:00`).toISOString())}&to=${encodeURIComponent(new Date(`${to}T23:59:59.999`).toISOString())}`;
                const d = await fetchBreakReport(q);
                setBreakRecords(d.breaks);
                if (currentUser.role !== "employee") {
                    const peopleData = await fetchPeopleReport(q);
                    setPeopleSummary(peopleData.people);
                }
            }
            if (target === "Attendance" || target === "Reports & policies") {
                if (currentUser.role !== "employee") {
                    const q = `?from=${encodeURIComponent(new Date(`${from}T00:00:00`).toISOString())}&to=${encodeURIComponent(new Date(`${to}T23:59:59.999`).toISOString())}`;
                    const d = await fetchDailyReport(q);
                    setRows(d.rows);
                    if (target === "Reports & policies") {
                        const peopleData = await fetchPeopleReport(q);
                        setPeopleSummary(peopleData.people);
                    }
                }
            }
            if (target === "Activities") {
                if (currentUser.role === "employee") {
                    const q = `?from=${encodeURIComponent(new Date(`${from}T00:00:00`).toISOString())}&to=${encodeURIComponent(new Date(`${to}T23:59:59.999`).toISOString())}`;
                    const d = await fetchMyTrackingEvents(q);
                    setEvents(toVisitRows(d.events));
                }
                else {
                    const q = `?from=${encodeURIComponent(new Date(`${from}T00:00:00`).toISOString())}&to=${encodeURIComponent(new Date(`${to}T23:59:59.999`).toISOString())}`;
                    const d = await fetchPeopleReport(q);
                    setPeopleSummary(d.people);
                }
            }
            if (target === "Activity analytics") {
                const q = `?from=${encodeURIComponent(new Date(`${from}T00:00:00`).toISOString())}&to=${encodeURIComponent(new Date(`${to}T23:59:59.999`).toISOString())}`;
                if (currentUser.role === "employee") {
                    const d = await fetchMyTrackingEvents(q);
                    setEvents(toVisitRows(d.events));
                }
                else if (selectedEmployeeId) {
                    const d = await fetchEmployeeDomainEvents(q, selectedEmployeeId);
                    setEvents(toVisitRows(d.events));
                }
            }
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : "Could not load this section");
        }
    }, [section, user, from, to, selectedEmployeeId, screenshotPage, screenshotEmployeeId]);
    useEffect(() => {
        if (section === "Screenshots" && user && user.role !== "employee" && screenshotEmployeeId) {
            void loadSection("Screenshots", user);
        }
    }, [section, user, screenshotEmployeeId, screenshotPage, loadSection]);
    const refreshSection = useCallback(async (target = section) => {
        setRefreshingSection(target);
        try {
            await loadSection(target, user);
        }
        finally {
            setRefreshingSection(null);
        }
    }, [loadSection, section, user]);
    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            // Authentication and workspace hydration are separate failure domains. A failed
            // session-history request must never erase a valid authenticated user.
            const current = await fetchCurrentUser();
            setUser(current.user);
            try {
                await loadCurrent(current.user);
            }
            catch (error) {
                setSession(null);
                setActiveBreak(null);
                setMessage(error instanceof Error
                    ? `Signed in, but session details could not load: ${error.message}`
                    : "Signed in, but session details could not load.");
            }
        }
        catch {
            setUser(null);
            setSession(null);
            setActiveBreak(null);
        }
        finally {
            setLoading(false);
        }
    }, [loadCurrent]);
    useEffect(() => { void refresh(); }, [refresh]);
    // All application feedback uses a temporary, global toast rather than a page banner.
    useEffect(() => {
        if (!message)
            return;
        const timeoutId = window.setTimeout(() => setMessage(current => current === message ? "" : current), 2200);
        return () => window.clearTimeout(timeoutId);
    }, [message]);
    useEffect(() => {
        if (user)
            void loadSection(section, user);
    }, [section, user, from, to, loadSection]);
    useEffect(() => { setReportPage(1); }, [from, to, reportPageSize]);
    // Pathname is the source of truth. Legacy hash links are normalized to clean routes.
    useEffect(() => {
        const legacy = parseRouteHash(location.hash);
        const hasLegacyHash = Boolean(location.hash);
        const route = hasLegacyHash ? legacy : parseRoutePath(location.pathname);
        const targetSection = route.section;
        const targetEmployeeId = route.employeeId ?? null;

        if (hasLegacyHash) {
            navigate(pathForSection(targetSection, targetEmployeeId), { replace: true });
            setSection(targetSection);
            setSelectedEmployeeId(targetEmployeeId);
            return;
        }

        syncingFromUrl.current = true;
        if (targetSection !== section) setSection(targetSection);
        if ((targetEmployeeId ?? null) !== (selectedEmployeeId ?? null)) {
            setSelectedEmployeeId(targetEmployeeId);
        }
    }, [location.pathname, location.hash, navigate]); // URL -> controller state

    useEffect(() => {
        const target = pathForSection(section, selectedEmployeeId);
        if (location.pathname !== target || location.hash) {
            navigate(target, { replace: false });
        }
    }, [section, selectedEmployeeId]); // controller state -> URL
    useEffect(() => {
        // Detail pages should always open at the top instead of inheriting the previous page scroll.
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        if (section === "Audit log") {
            requestAnimationFrame(() => {
                const el = document.getElementById("audit-log-table");
                if (el)
                    el.scrollLeft = 0;
            });
        }
    }, [section, selectedEmployeeId]);
    async function loginWithCredentials(loginEmail, loginPassword) {
        setBusy(true);
        setMessage("");
        setLoginError("");
        try {
            const result = await loginRequest(loginEmail, loginPassword);
            // Commit auth immediately after /auth/login succeeds. Session hydration is
            // secondary and must not make the sign-in screen reappear.
            setUser(result.user);
            setEmail(loginEmail);
            setPassword("");
            setSection("Overview");
            setMessage(`Signed in as ${result.user.role}.`);
            try {
                await loadCurrent(result.user);
            }
            catch (error) {
                setSession(null);
                setActiveBreak(null);
                setMessage(error instanceof Error
                    ? `Signed in successfully, but session details could not load: ${error.message}`
                    : "Signed in successfully, but session details could not load.");
            }
        }
        catch (error) {
            const text = error instanceof Error ? error.message : "Login failed";
            setLoginError(text);
            setMessage(text);
        }
        finally {
            setBusy(false);
        }
    }
    async function login(e) { e.preventDefault(); await loginWithCredentials(email, password); }
    function notifyExtensionSessionStarted() {
        // Ask the installed extension to exchange the signed-in app cookie for a session-scoped token.
        // This signal is sent only after the server successfully creates the work session.
        window.postMessage({ source: "trackwise-app", type: "WORK_SESSION_STARTED" }, window.location.origin);
    }
    function notifyExtensionSessionEnded() {
        // Content script forwards this lifecycle signal to stop tracking after the API ends the session.
        window.postMessage({ source: "trackwise-app", type: "WORK_SESSION_ENDED" }, window.location.origin);
    }
    async function prepareExtensionSessionEnd() {
        const requestId = `end-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        return await new Promise(resolve => {
            let finished = false;
            const finish = (result) => {
                if (finished)
                    return;
                finished = true;
                window.removeEventListener("message", onResponse);
                window.clearTimeout(timeout);
                resolve(result);
            };
            const onResponse = (event) => {
                if (event.source !== window || event.origin !== window.location.origin)
                    return;
                const data = event.data;
                if (data?.source !== "trackwise-extension" || data.type !== "WORK_SESSION_END_PREPARED" || data.requestId !== requestId)
                    return;
                const result = data.result || {};
                finish({ available: true, ok: Boolean(result.ok), pendingCount: Number(result.pendingCount || 0) });
            };
            const timeout = window.setTimeout(() => finish({ available: false, ok: true }), 1200);
            window.addEventListener("message", onResponse);
            window.postMessage({ source: "trackwise-app", type: "PREPARE_WORK_SESSION_END", requestId }, window.location.origin);
        });
    }
    async function logout() {
        setBusy(true);
        try {
            await logoutRequest();
            notifyExtensionSessionEnded();
            setUser(null);
            setSession(null);
            setActiveBreak(null);
            setUsers([]);
            setRows([]);
            setEvents([]);
            setMessage("Signed out.");
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : "Logout failed");
        }
        finally {
            setBusy(false);
        }
    }
    async function action(path, body = {}, method = "POST") {
        setBusy(true);
        setMessage("");
        try {
            if (/^\/sessions\/[^/]+\/end$/.test(path)) {
                const prepared = await prepareExtensionSessionEnd();
                if (prepared.available && !prepared.ok) {
                    throw new Error(`Tracking events are still waiting to sync (${prepared.pendingCount ?? "unknown"}). Please retry ending the session while the extension is connected.`);
                }
            }
            await api(path, { method, body: JSON.stringify(body) });
            if (path === "/sessions")
                notifyExtensionSessionStarted();
            if (/^\/sessions\/[^/]+\/end$/.test(path))
                notifyExtensionSessionEnded();
            setMessage("Saved successfully.");
            if (user)
                await loadCurrent(user);
            await loadSection(section, user);
            return true;
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : "Action failed");
            return false;
        }
        finally {
            setBusy(false);
        }
    }
    function beginEdit(u) { setEditingUserId(u.id || u._id || null); setEditName(u.name); setEditEmail(u.email); setEditRole(u.role); setEditTeam(u.teamName || ""); setEditManagerId(u.managerId ? String(u.managerId) : ""); }
    async function saveUserEdit(e) {
        e.preventDefault();
        if (!editingUserId)
            return;
        const saved = await action(`/users/${editingUserId}`, { name: editName, email: editEmail, role: editRole, teamName: editTeam, managerId: editManagerId || null }, "PATCH");
        if (!saved)
            return;
        setEditingUserId(null);
        await loadSection("Team & users", user);
    }
    async function saveScreenshotPolicy(e) {
        e.preventDefault();
        const excludedDomains = excludedDomainsText.split(/[\n,]/).map(v => v.trim().toLowerCase()).filter(Boolean);
        try {
            const d = await updateScreenshotPolicy({ ...screenshotPolicy, excludedDomains });
            setScreenshotPolicy(d.policy);
            setExcludedDomainsText((d.policy.excludedDomains || []).join("\n"));
            setMessage("Screenshot policy saved.");
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not save screenshot policy");
        }
    }
    async function viewScreenshot(row) {
        try {
            const d = await fetchScreenshotAccess(String(row.screenshotId || row._id));
            setScreenshotImageUrl(d.url);
            setScreenshotImageLabel(`${row.employee?.name || "Employee"} · ${dateLabel(row.capturedAt)} · expires ${dateLabel(d.expiresAt)}`);
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not open screenshot");
        }
    }
    async function deleteScreenshot(row) {
        if (!window.confirm("Permanently delete this screenshot from Cloudinary and Trackwise metadata?"))
            return;
        try {
            await deleteScreenshotRequest(String(row.screenshotId || row._id));
            setScreenshotRows(old => old.filter(item => (item.screenshotId || item._id) !== (row.screenshotId || row._id)));
            setScreenshotTotal(old => Math.max(0, old - 1));
            setMessage("Screenshot deleted.");
        }
        catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not delete screenshot");
        }
    }
    async function createUser(e) {
        e.preventDefault();
        const created = await action("/users", {
            name: newName,
            email: newEmail,
            password: newPassword,
            role: newRole,
            teamName: newTeam,
            managerId: newManagerId || null,
        });
        if (!created)
            return;
        setNewName("");
        setNewEmail("");
        setNewPassword("");
        setNewTeam("");
        setNewManagerId("");
        await loadSection("Team & users", user);
    }
    // Prefix spreadsheet formula-like values so names/domains from external data cannot
    // execute as formulas when a CSV is opened in Excel/LibreOffice.
    function csvCell(value) {
        let text = String(value ?? "");
        if (/^[\u0000-\u0020]*[=+\-@]/.test(text) || /^[\t\r]/.test(text))
            text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    }
    function exportCsv() {
        const source = section === "Activities" && user?.role !== "employee" ? peopleSummary : (section === "Breaks" || section === "Break analytics") ? breakRecords.filter((b) => section !== "Break analytics" || String(b.employeeId?._id || b.employeeId?.id || b.employeeId || "") === String(selectedEmployeeId)) : (section === "Activity analytics" || section === "Activities") ? events : rows;
        if (!source.length) {
            setMessage("There is no data to export for this date range.");
            return;
        }
        const isActivityTimeline = section === "Activity analytics" || (section === "Activities" && user?.role === "employee");
        const isBreakReport = section === "Breaks" || section === "Break analytics";
        const headers = isBreakReport ? ["Employee", "Break type", "Started At", "Ended At", "Duration", "Status", "Session ID"] : isActivityTimeline ? ["Activity", "Domain / state", "Started At", "Ended At", "Duration", "Session ID"] : section === "Activities" ? ["Employee", "Email", "Team", "Account status", "Session status", "Sessions", "Tracked time", "Break time", "Website visits", "Unique domains", "Tab switches"] : ["Employee", "Email", "Session ID", "Started At", "Ended At", "Status", "Session time", "Break time"];
        const lines = [headers, ...source.map((item) => isBreakReport
                ? [typeof item.employeeId === "object" ? item.employeeId?.name : user?.name, item.type, item.startedAt, item.endedAt || "", duration(item.durationMs), item.status, item.sessionId]
                : isActivityTimeline
                    ? [item.type === "IDLE_PERIOD" ? "Idle session" : item.type === "TAB_SWITCH" ? "Tab switch" : "Website session", item.type === "TAB_SWITCH" ? `${item.previousDomain || "Unknown"} -> ${item.domain}` : item.domain, item.startedAt, item.endedAt || "", item.durationMs == null ? "" : duration(item.durationMs), item.sessionId]
                    : section === "Activities"
                        ? [item.name || "Unknown", item.email || "", item.teamName || "", item.isActive ? "Active" : "Inactive", item.activeSessions || 0, item.sessions || 0, duration(item.sessionMs), duration(item.breakMs), item.domainEvents || 0, item.uniqueDomains || 0, item.tabSwitches || 0]
                        : [item.employee?.name || "Unknown", item.employee?.email || "", item.sessionId, item.startedAt, item.endedAt || "", item.status, duration(item.sessionMs), duration(item.breakMs)])];
        const csv = "\uFEFF" + lines.map(line => line.map(csvCell).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `trackwise-${section.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${from}-to-${to}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const demoAccounts = import.meta.env.DEV ? [{ label: "Continue as Admin", email: "admin@demo.local", password: "AdminDemo123!", role: "Admin" }, { label: "Continue as Manager", email: "manager@demo.local", password: "ManagerDemo123!", role: "Manager" }, { label: "Continue as Employee", email: "employee@demo.local", password: "EmployeeDemo123!", role: "Employee" }] : [];
    const idleEvents = events.filter(ev => ev.type === "IDLE_PERIOD");
    const switchEvents = events.filter(ev => ev.type === "TAB_SWITCH");
    const visitEvents = events.filter(ev => ev.type !== "IDLE_PERIOD" && ev.type !== "TAB_SWITCH");
    const visibleEvents = (activityFilter === "idle" ? idleEvents : activityFilter === "visits" ? visitEvents : activityFilter === "switches" ? switchEvents : events).filter(ev => !domainFilter || (ev.type !== "IDLE_PERIOD" && ev.type !== "TAB_SWITCH" && ev.domain === domainFilter));
    const dailyActivity = buildDailyActivity(events, from, to);
    const domainActivity = buildDomainActivity(visitEvents);
    const totalIdleMs = idleEvents.reduce((sum, ev) => sum + (ev.durationMs || 0), 0);
    const totalVisitMs = visitEvents.reduce((sum, ev) => sum + (ev.durationMs || 0), 0);
    const uniqueDomains = new Set(visitEvents.map(ev => ev.domain).filter(domain => domain && domain !== "System idle")).size;
    const ongoingCount = events.filter(ev => !ev.endedAt).length;
    const pageContext = { Activity, ActivityAnalyticsSection, AlertTriangle, ArrowLeft, CalendarDays, Camera, ChartNoAxesCombined, Clock3, Coffee, Download, Empty, Filters, Gauge, Info, Plus, RefreshCw, Search, Settings, ShieldCheck, Users, action, activeBreak, activityFilter, activitySearch, auditLogs, beginEdit, breakRecords, busy, chartMode, createUser, dailyActivity, dashboardSummary, dateLabel, deleteScreenshot, domainActivity, domainFilter, duration, editEmail, editManagerId, editName, editRole, editTeam, editingUserId, email, events, excludedDomainsText, exportCsv, from, idleChartMode, idleEvents, loading, newEmail, newManagerId, newName, newPassword, newRole, newTeam, ongoingCount, password, peopleSummary, qualitySessions, refresh, refreshSection, refreshingSection, reportPage, reportPageSize, rows, saveScreenshotPolicy, saveUserEdit, screenshotEmployeeId, screenshotPage, screenshotPolicy, screenshotRows, screenshotTotal, section, selectedEmployeeId, session, sessionHistory, setActivityFilter, setActivitySearch, setChartMode, setDomainFilter, setEditEmail, setEditManagerId, setEditName, setEditRole, setEditTeam, setEditingUserId, setExcludedDomainsText, setFrom, setIdleChartMode, setNewEmail, setNewManagerId, setNewName, setNewPassword, setNewRole, setNewTeam, setReportPage, setReportPageSize, setScreenshotEmployeeId, setScreenshotPage, setScreenshotPolicy, setScreenshotRows, setScreenshotTotal, setSection, setSelectedEmployeeId, setTo, switchEvents, to, totalIdleMs, totalVisitMs, uniqueDomains, user, users, viewScreenshot, visibleEvents, visitEvents };
    return {
        loading, user, message, setMessage, section, setSection, selectedEmployeeId, setSelectedEmployeeId,
        email, password, setEmail, setPassword, busy, login, loginWithCredentials, demoAccounts,
        loginError, screenshotImageUrl, setScreenshotImageUrl, screenshotImageLabel, setScreenshotImageLabel,
        logout, pageContext,
    };
}
