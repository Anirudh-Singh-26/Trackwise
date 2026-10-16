const $ = id => document.getElementById(id);
const DEFAULT_API = "http://localhost:5000/api/v1";
const APP_URL = "http://localhost:5173";
let autoConnectAttempted = false;

function setMessage(message, kind = "info") {
  $("message").textContent = message || "";
  const banner = $("connection");
  banner.classList.toggle("is-warning", kind === "warning");
  banner.classList.toggle("is-connected", kind === "success");
}

function validApiBase(value) {
  const parsed = new URL(value);
  const local = ["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.protocol === "http:";
  if (!local && parsed.protocol !== "https:") throw new Error("Use HTTPS for a non-local API server.");
  return parsed.href.replace(/\/$/, "");
}

async function getSignedInCookie() {
  const cookie = await chrome.cookies.get({ url: APP_URL, name: "tracker_token" });
  return cookie?.value || null;
}

async function connectFromSignedInSession({ quiet = false } = {}) {
  const button = $("connectSignedIn");
  button.disabled = true;
  if (!quiet) setMessage("Checking your signed-in employee session…");
  try {
    const apiBaseUrl = validApiBase($("api").value.trim() || DEFAULT_API);
    await chrome.storage.local.set({ apiBaseUrl });
    const cookieValue = await getSignedInCookie();
    if (!cookieValue) {
      if (!quiet) setMessage("No signed-in Trackwise account found. Open Trackwise, sign in as an employee, start a work session, then reopen this extension.", "warning");
      return false;
    }
    const response = await fetch(`${apiBaseUrl}/auth/extension-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cookieValue}` },
      body: "{}",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 409) {
        setMessage("You're signed in, but no active work session was found. Start a session in Trackwise, then reopen this extension.", "warning");
      } else if (response.status === 401) {
        setMessage(data.message || "Your Trackwise login expired. Sign in again and reopen this extension.", "warning");
      } else {
        setMessage(data.message || `Could not connect (${response.status}).`, "warning");
      }
      return false;
    }
    await chrome.storage.local.set({
      apiBaseUrl,
      extensionToken: data.token,
      sessionId: data.sessionId,
      employeeName: data.user?.name || data.user?.email || "Employee",
      breakActive: false,
      uploadStatus: "Connected using your signed-in Trackwise session.",
    });
    const started = await chrome.runtime.sendMessage({ type: "TRACKWISE_CONNECT" });
    if (!started?.ok) throw new Error("Your session was verified, but tracking could not start. Reload the extension and try again.");
    setMessage("Connected securely using your existing Trackwise login.", "success");
    await refresh();
    return true;
  } catch (err) {
    setMessage(err.message || "Could not connect using your signed-in session.", "warning");
    return false;
  } finally {
    button.disabled = false;
    await refresh();
  }
}

async function refresh() {
  const s = await chrome.storage.local.get(["apiBaseUrl", "extensionToken", "sessionId", "eventQueue", "lastObservedDomain", "currentDomain", "browserIdleState", "lastSyncAt", "uploadStatus", "employeeName", "breakActive", "screenshotPermissionGranted", "screenshotPolicy", "screenshotStatus"]);
  if (!$('api').value || !$('api').value.trim()) $('api').value = s.apiBaseUrl || DEFAULT_API;
  else if (s.apiBaseUrl) $('api').value = s.apiBaseUrl;
  const connected = Boolean(s.extensionToken && s.sessionId);
  const allSitesGranted = await chrome.permissions.contains({ origins: ["<all_urls>"] }).catch(() => false);
  const screenshotAccessGranted = Boolean(s.screenshotPermissionGranted && allSitesGranted);
  $("login").hidden = connected;
  $("connected").hidden = !connected;
  $("connectionText").textContent = connected ? `Connected${s.employeeName ? ` as ${s.employeeName}` : ""}` : "Not connected to an active work session";
  $("connection").classList.toggle("is-connected", connected);
  $("connection").classList.toggle("is-warning", !connected && Boolean(s.uploadStatus?.includes("no longer active")));
  $("headline").textContent = connected ? "You're connected" : "Connect your workspace";
  $("subhead").textContent = connected ? "Trackwise is ready to record domain-level activity." : "Use your existing employee login—no need to enter your password twice.";
  $("domain").textContent = s.currentDomain || (s.browserIdleState === "idle" || s.browserIdleState === "locked" ? "System idle" : s.breakActive ? "On break" : "No trackable domain in focus");
  $("count").textContent = String((s.eventQueue || []).length);
  $("state").textContent = s.breakActive ? "On break" : (s.browserIdleState || "Unknown").replace(/^./, c => c.toUpperCase());
  $("sync").textContent = s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleTimeString() : "Not synced yet";
  $("employeeName").textContent = s.employeeName || "Employee";
  $("avatar").textContent = (s.employeeName || "T").trim().charAt(0).toUpperCase();
  const policy = s.screenshotPolicy;
  $("screenshotStatus").textContent = !connected ? "Connect an active work session to check screenshot policy." : !policy ? (s.screenshotStatus || "Policy has not been verified yet. Reopen the popup or reconnect to retry.") : !policy.enabled ? "Screenshot monitoring is disabled by your organization." : `${policy.intervalSeconds}s interval · visible tab only · ${policy.pauseDuringIdle ? "pauses while idle" : "idle pause disabled"} · ${policy.pauseDuringBreaks ? "pauses during breaks" : "break pause disabled"}. ${screenshotAccessGranted ? (s.screenshotStatus || "Site access granted.") : "Broad site access not yet granted; grant access to enable visible-tab capture."}`;
  $("grantScreenshotAccess").hidden = !connected || !policy?.enabled || screenshotAccessGranted;
  if (s.uploadStatus && !$("message").textContent) $("message").textContent = s.uploadStatus;
}

$("openEmployeeLogin").addEventListener("click", async () => {
  await chrome.tabs.create({ url: `${APP_URL}/login` });
  setMessage("Trackwise opened in a new tab. Sign in as an employee and start your work session. Then reopen this extension; it will connect automatically.");
});

$("connectSignedIn").addEventListener("click", () => connectFromSignedInSession());

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const submit = $("loginForm").querySelector("button[type='submit']");
  submit.disabled = true;
  setMessage("Connecting securely…");
  try {
    const apiBaseUrl = validApiBase($("api").value.trim() || DEFAULT_API);
    const parsed = new URL(apiBaseUrl);
    const allowed = await chrome.permissions.contains({ origins: [`${parsed.origin}/*`] });
    if (!allowed) {
      const granted = await chrome.permissions.request({ origins: [`${parsed.origin}/*`] });
      if (!granted) throw new Error("Permission to connect to this API host was not granted.");
    }
    const response = await fetch(`${apiBaseUrl}/auth/extension-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: $("email").value, password: $("password").value }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Connection failed (${response.status})`);
    await chrome.storage.local.set({ apiBaseUrl, extensionToken: data.token, sessionId: data.sessionId, employeeName: data.user?.name || data.user?.email || "Employee", breakActive: false, uploadStatus: "Connected. Checking session health…" });
    $("password").value = "";
    const started = await chrome.runtime.sendMessage({ type: "TRACKWISE_CONNECT" });
    if (!started?.ok) throw new Error("Credentials were accepted, but tracking could not start. Check that the work session is active.");
    setMessage("Connected successfully.", "success");
  } catch (err) { setMessage(err.message || "Could not connect", "warning"); }
  finally { submit.disabled = false; await refresh(); }
});

$("grantScreenshotAccess").addEventListener("click", async () => {
  const button = $("grantScreenshotAccess"); button.disabled = true;
  try {
    const granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
    if (!granted) throw new Error("All-sites permission was not granted. Screenshot capture remains paused.");
    const confirmed = await chrome.permissions.contains({ origins: ["<all_urls>"] });
    if (!confirmed) throw new Error("Chrome did not confirm the required <all_urls> permission.");
    await chrome.storage.local.set({ screenshotPermissionGranted: true });
    const response = await chrome.runtime.sendMessage({ type: "TRACKWISE_SCREENSHOT_PERMISSION_GRANTED" });
    if (!response?.ok) throw new Error("Permission granted, but the screenshot policy could not be synchronized. Reopen this popup to retry.");
    setMessage("Site access granted. Screenshot monitoring will follow the server policy and pause during idle/breaks.", "success");
  } catch (err) { setMessage(err.message || "Could not grant screenshot access.", "warning"); }
  finally { button.disabled = false; await refresh(); }
});

$("disconnect").addEventListener("click", async () => {
  $("disconnect").disabled = true;
  setMessage("Stopping tracking…");
  try {
    await chrome.runtime.sendMessage({ type: "TRACKWISE_DISCONNECT" });
    setMessage("Disconnected. Browser tracking and periodic sync are stopped.", "success");
  } catch (err) { setMessage(err.message || "Could not disconnect cleanly.", "warning"); }
  finally { $("disconnect").disabled = false; await refresh(); }
});

// Keep an open popup in sync when the background detects session expiry or the web app ends a session.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (["extensionToken", "sessionId", "employeeName", "uploadStatus", "currentDomain", "breakActive", "browserIdleState", "eventQueue", "lastSyncAt", "screenshotPolicy", "screenshotStatus", "screenshotPermissionGranted"].some(key => key in changes)) {
    void refresh();
  }
});

(async function init() {
  const state = await chrome.storage.local.get(["apiBaseUrl", "extensionToken", "sessionId"]);
  $("api").value = state.apiBaseUrl || DEFAULT_API;
  await refresh();
  if (!autoConnectAttempted && !(state.extensionToken && state.sessionId)) {
    autoConnectAttempted = true;
    // Opening the popup is the employee's explicit action; exchange the existing
    // signed-in cookie for a scoped extension token only when an active session exists.
    await connectFromSignedInSession({ quiet: true });
  }
})();
