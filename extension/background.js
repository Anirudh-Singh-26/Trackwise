const DEFAULT_API = "http://localhost:5000/api/v1";
const MAX_QUEUE = 500;
let IDLE_THRESHOLD_SECONDS = 60; // Updated from the admin-managed screenshot policy.
const SYNC_ALARM = "trackwise-sync";
const SCREENSHOT_ALARM = "trackwise-screenshot";
const APP_URL = "http://localhost:5173";
let operationChain = Promise.resolve();
let flushInFlight = null;

function debugLog(step, details = {}) {
  console.log(`[Trackwise Debug] ${step}`, { time: new Date().toISOString(), ...details });
}
function serial(task) {
  operationChain = operationChain.then(task, task).catch(error => debugLog("SERIAL_TASK_ERROR", { error: String(error) }));
  return operationChain;
}
function domainFrom(url) {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    const domain = u.hostname.toLowerCase();
    if (!domain || domain === "localhost" || domain === "127.0.0.1") return null;
    return domain;
  } catch { return null; }
}
async function getState() {
  return chrome.storage.local.get([
    "apiBaseUrl", "extensionToken", "sessionId", "eventQueue",
    "activeVisit", "activeIdle", "browserIdleState", "breakActive", "browserFocused", "lastObservedDomain", "currentDomain", "lastObservedTabId", "screenshotPermissionGranted", "screenshotPolicy"
  ]);
}
// WINDOW_ID_NONE can be emitted while Chrome briefly transfers focus to extension UI.
// Do not let a stale persisted `browserFocused: false` permanently suppress website
// visits after the popup closes. Reconcile it against Chrome's current window state.
async function refreshBrowserFocusState() {
  try {
    const focusedWindow = await chrome.windows.getLastFocused({ populate: false });
    const focused = Boolean(focusedWindow && focusedWindow.id !== chrome.windows.WINDOW_ID_NONE && focusedWindow.focused);
    const stored = await chrome.storage.local.get("browserFocused");
    if (stored.browserFocused !== focused) {
      await chrome.storage.local.set({ browserFocused: focused });
      debugLog("BROWSER_FOCUS_RECONCILED", { focused, windowId: focusedWindow?.id ?? null });
    }
    return focused;
  } catch (error) {
    debugLog("BROWSER_FOCUS_RECONCILE_FAILED", { error: String(error) });
    const stored = await chrome.storage.local.get("browserFocused");
    return stored.browserFocused !== false;
  }
}
function isConnected(state) {
  return Boolean(state?.extensionToken && state?.sessionId);
}

// Display the existing idle state inside the employee's current webpage.
// This is UI-only: it does not create, close, or upload tracking events.
async function syncIdleOverlayForTab(tabId = undefined) {
  const state = await getState();
  const shouldShow = isConnected(state) && !state.breakActive &&
    (state.browserIdleState === "idle" || state.browserIdleState === "locked");
  const overlayState = shouldShow ? state.browserIdleState : "active";
  const startedAt = shouldShow
    ? (state.activeIdle?.startedAt || state.browserIdleChangedAt || new Date().toISOString())
    : null;
  await chrome.storage.local.set({ idleUiState: overlayState, idleUiStartedAt: startedAt });

  let tab;
  try {
    tab = Number.isInteger(tabId)
      ? await chrome.tabs.get(tabId)
      : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  } catch {
    return;
  }
  if (!Number.isInteger(tab?.id) || !/^https?:\/\//i.test(tab.url || "")) return;

  // Once disconnected, do not inject new code; only send a best-effort hide signal
  // to a previously injected overlay in the current tab.
  if (!isConnected(state)) {
    try { await chrome.tabs.sendMessage(tab.id, { type: "TRACKWISE_IDLE_STATE", state: "active", startedAt: null }); } catch {}
    return;
  }

  try {
    const hasSiteAccess = await chrome.permissions.contains({ origins: ["<all_urls>"] });
    if (!hasSiteAccess) {
      debugLog("IDLE_OVERLAY_SKIPPED", { reason: "site-permission-missing", tabId: tab.id });
      return;
    }
    // The existing overlay script is guarded against duplicate hosts. Reinjecting
    // after navigation ensures it exists on the newly loaded webpage.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["idle-overlay.js"] });
    await chrome.tabs.sendMessage(tab.id, {
      type: "TRACKWISE_IDLE_STATE",
      state: overlayState,
      startedAt
    });
    debugLog("IDLE_OVERLAY_SYNCED", { state: overlayState, tabId: tab.id });
  } catch (error) {
    // Chrome-internal/restricted pages and tabs without granted site access cannot
    // host content scripts. Tracking continues unchanged on those pages.
    debugLog("IDLE_OVERLAY_UNAVAILABLE", { tabId: tab.id, error: String(error) });
  }
}

async function applyIdleThreshold(policy) {
  const requested = Number(policy?.idleThresholdSeconds);
  if (!Number.isInteger(requested) || requested < 30 || requested > 300 || requested === IDLE_THRESHOLD_SECONDS) return;
  IDLE_THRESHOLD_SECONDS = requested;
  await chrome.idle.setDetectionInterval(requested);
  debugLog("IDLE_THRESHOLD_APPLIED", { thresholdSeconds: requested });
}
async function refreshIdleThresholdPolicy() {
  const state = await getState();
  if (!isConnected(state)) return;
  const apiBaseUrl = String(state.apiBaseUrl || DEFAULT_API).trim().replace(/\/+$/, "");
  try {
    const response = await fetch(`${apiBaseUrl}/screenshots/policy`, { headers: { Authorization: `Bearer ${state.extensionToken}` } });
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    if (!data.policy) return;
    await chrome.storage.local.set({ screenshotPolicy: data.policy });
    await applyIdleThreshold(data.policy);
  } catch (error) {
    debugLog("IDLE_THRESHOLD_REFRESH_FAILED", { error: error instanceof Error ? error.message : String(error) });
  }
}
async function reconcileSyncAlarm() {
  const state = await getState();
  if (!isConnected(state)) {
    await chrome.alarms.clear(SYNC_ALARM);
    debugLog("SYNC_ALARM_DISABLED", { reason: "extension-disconnected" });
    return false;
  }
  const existing = await chrome.alarms.get(SYNC_ALARM);
  if (!existing) await chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 0.5 });
  debugLog("SYNC_ALARM_ENABLED", { reason: existing ? "already-scheduled" : "connected" });
  return true;
}
async function clearInvalidConnection(reason) {
  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setTitle({ title: "Trackwise — not connected" });
  await chrome.alarms.clear(SYNC_ALARM);
  await chrome.alarms.clear(SCREENSHOT_ALARM);
  const state = await getState();
  // Do not create events for an ended/revoked session: the API would reject them.
  await chrome.storage.local.remove(["activeVisit", "activeIdle"]);
  await chrome.storage.local.set({ currentDomain: null });
  const queue = Array.isArray(state.eventQueue) ? state.eventQueue.filter(event => event.sessionId !== state.sessionId) : [];
  await chrome.storage.local.set({ eventQueue: queue, uploadStatus: reason || "Session ended. Reconnect after starting a new work session." });
  await chrome.storage.local.remove(["extensionToken", "sessionId", "employeeName", "breakActive", "lastHeartbeatAt"]);
  await chrome.storage.local.set({ currentDomain: null });
  await syncIdleOverlayForTab();
  debugLog("TRACKING_STOPPED", { reason: "invalid-session" });
}
async function disconnectTracking() {
  await chrome.action.setBadgeText({ text: "" });
  await chrome.action.setTitle({ title: "Trackwise — not connected" });
  // Disable the repeating triggers first so no new periodic work starts while stopping.
  await chrome.alarms.clear(SYNC_ALARM);
  await chrome.alarms.clear(SCREENSHOT_ALARM);
  const state = await getState();
  if (isConnected(state)) {
    await closeActiveVisit(state, "extension-disconnected");
    await endIdleInterval(await getState(), "extension-disconnected");
    // Best effort: upload the final end events while the current session is still valid.
    await flushQueue();
  }
  await chrome.storage.local.remove(["extensionToken", "sessionId", "employeeName", "breakActive", "lastHeartbeatAt", "activeVisit", "activeIdle"]);
  await chrome.storage.local.set({ currentDomain: null, uploadStatus: "Disconnected. Tracking and periodic sync are stopped." });
  await syncIdleOverlayForTab();
  debugLog("TRACKING_STOPPED", { reason: "user-disconnected" });
}
async function connectTracking() {
  const state = await getState();
  if (!isConnected(state)) return false;
  await applyIdleThreshold(state.screenshotPolicy);
  await chrome.action.setBadgeBackgroundColor({ color: "#16803c" });
  await chrome.action.setBadgeText({ text: "ON" });
  await chrome.action.setTitle({ title: "Trackwise — connected and tracking" });
  await reconcileSyncAlarm();
  await reconcileScreenshotAlarm();
  const currentState = await chrome.idle.queryState(IDLE_THRESHOLD_SECONDS);
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  await chrome.storage.local.set({ browserIdleState: currentState, ...(Number.isInteger(activeTab?.id) ? { lastObservedTabId: activeTab.id } : {}), ...(currentState !== "active" ? { currentDomain: null } : {}) });
  if (currentState === "idle" || currentState === "locked") {
    const detectedAt = new Date();
    const estimatedIdleStart = currentState === "idle" ? new Date(detectedAt.getTime() - IDLE_THRESHOLD_SECONDS * 1000) : detectedAt;
    await closeActiveVisit(await getState(), `browser-${currentState}-on-connect`, estimatedIdleStart);
    await startIdleInterval(currentState, detectedAt);
  } else {
    await inspect("connected");
  }
  await flushQueue();
  await syncIdleOverlayForTab();
  return true;
}
function newEvent(state, type, visit, observedAt = new Date().toISOString()) {
  return {
    schemaVersion: 1,
    eventId: crypto.randomUUID(),
    source: "chrome_extension",
    sessionId: state.sessionId,
    type,
    visitId: visit.visitId,
    tabId: visit.tabId,
    domain: visit.domain,
    observedAt
  };
}
function newIdleEvent(state, type, idle, observedAt = new Date().toISOString()) {
  return {
    schemaVersion: 1,
    eventId: crypto.randomUUID(),
    source: "chrome_extension",
    sessionId: idle.sessionId || state.sessionId,
    type,
    activityId: idle.activityId,
    domain: "system.activity",
    observedAt
  };
}
function newTabSwitchEvent(state, tab, destinationDomain, previousDomain, observedAt = new Date().toISOString()) {
  return {
    schemaVersion: 1,
    eventId: crypto.randomUUID(),
    source: "chrome_extension",
    sessionId: state.sessionId,
    type: "TAB_SWITCH",
    tabId: tab.id,
    previousDomain: previousDomain || null,
    domain: destinationDomain || "browser.internal",
    observedAt
  };
}
async function startIdleInterval(stateName, detectedAt = new Date()) {
  const state = await getState();
  if (!state.extensionToken || !state.sessionId || state.breakActive) return;
  if (state.activeIdle?.sessionId === state.sessionId) return;
  if (state.activeIdle && state.activeIdle.sessionId !== state.sessionId) {
    await chrome.storage.local.remove("activeIdle");
  }
  // Chrome reports ordinary idle after the threshold; estimate its start by backdating.
  // A lock is a separate state transition, so do not subtract the idle threshold from it.
  const idleSince = stateName === "idle"
    ? new Date(detectedAt.getTime() - IDLE_THRESHOLD_SECONDS * 1000)
    : new Date(detectedAt.getTime());
  const idle = { activityId: crypto.randomUUID(), sessionId: state.sessionId, stateName, startedAt: idleSince.toISOString() };
  await enqueueEvents([newIdleEvent(state, "IDLE_START", idle, idle.startedAt)], state);
  await chrome.storage.local.set({ activeIdle: idle });
  debugLog("IDLE_STARTED", { stateName, idleSince: idle.startedAt, detectedAt: detectedAt.toISOString(), thresholdSeconds: IDLE_THRESHOLD_SECONDS });
}
async function endIdleInterval(state, reason = "user-active", endedAt = new Date()) {
  const idle = state.activeIdle;
  if (!idle) return;
  if (idle.sessionId === state.sessionId && state.extensionToken) {
    await enqueueEvents([newIdleEvent(state, "IDLE_END", idle, endedAt.toISOString())], state);
  }
  await chrome.storage.local.remove("activeIdle");
  debugLog("IDLE_ENDED", { reason, startedAt: idle.startedAt, endedAt: endedAt.toISOString(), durationMs: Math.max(0, endedAt.getTime() - new Date(idle.startedAt).getTime()) });
}
async function enqueueEvents(events, state) {
  if (!events.length) return;
  const current = await chrome.storage.local.get(["eventQueue"]);
  const queue = Array.isArray(current.eventQueue) ? current.eventQueue : [];
  queue.push(...events);
  const latestDomainEvent = [...events].reverse().find(event => ["VISIT_START", "VISIT_END", "DOMAIN_STATE_CHANGE"].includes(event.type));
  await chrome.storage.local.set({
    eventQueue: queue.slice(-MAX_QUEUE),
    ...(latestDomainEvent ? { lastObservedDomain: latestDomainEvent.domain } : {}),
    lastObservedAt: events[events.length - 1].observedAt
  });
  debugLog("TRACKING_EVENTS_QUEUED", { events: events.map(e => ({ type: e.type, domain: e.domain, visitId: e.visitId })), queueLength: Math.min(queue.length, MAX_QUEUE) });
}
async function closeActiveVisit(state, reason, endedAtDate = new Date()) {
  const visit = state.activeVisit;
  if (!visit) return;
  const endedAt = endedAtDate.toISOString();
  await enqueueEvents([newEvent(state, "VISIT_END", visit, endedAt)], state);
  await chrome.storage.local.remove("activeVisit");
  debugLog("VISIT_ENDED", { reason, domain: visit.domain, tabId: visit.tabId, startedAt: visit.startedAt, endedAt });
}
async function activateTab(tab, reason = "tab-change", urlOverride = undefined) {
  await syncIdleOverlayForTab(tab?.id);
  const state = await getState();
  // Avoid both tracking work and noisy tab-observation logs while disconnected.
  if (!isConnected(state)) return;
  const browserFocused = await refreshBrowserFocusState();
  debugLog("TAB_OBSERVED", { reason, tabId: tab?.id, url: tab?.url, hasToken: true, hasSessionId: true, browserFocused });
  const effectiveUrl = typeof urlOverride === "string" ? urlOverride : (tab?.url || "");
  const domain = domainFrom(effectiveUrl);
  let active = state.activeVisit;
  // Record actual Chrome tab-activation transitions before idle/focus guards. This avoids
  // dropping a switch when Chrome's idle/focus state update arrives just after onActivated.
  // The event stores domains and a timestamp only, never page content or user input.
  if (reason === "tab-activated" && Number.isInteger(tab?.id)) {
    const priorTabId = state.lastObservedTabId;
    if (Number.isInteger(priorTabId) && priorTabId !== tab.id && !state.breakActive) {
      const previousDomain = active?.domain || state.lastObservedDomain || null;
      await enqueueEvents([newTabSwitchEvent(state, tab, domain, previousDomain)], state);
      debugLog("TAB_SWITCH_RECORDED", { fromTabId: priorTabId, toTabId: tab.id, fromDomain: previousDomain || "unknown", toDomain: domain || "browser.internal" });
    }
  }
  if (Number.isInteger(tab?.id)) await chrome.storage.local.set({ lastObservedTabId: tab.id });
  if (state.breakActive || state.browserIdleState === "idle" || state.browserIdleState === "locked" || !browserFocused) {
    await closeActiveVisit(state, state.breakActive ? "break" : state.browserIdleState || "window-unfocused");
    await chrome.storage.local.set({ currentDomain: null });
    return;
  }
  if (!domain || !Number.isInteger(tab?.id)) {
    await closeActiveVisit(state, "unsupported-tab");
    await chrome.storage.local.set({ currentDomain: null });
    // A navigation to a browser/internal page is still an exit from the prior domain.
    void flushQueue();
    return;
  }
  active = state.activeVisit;
  // Never attach an old session's open visit to a newly connected session.
  if (active && active.sessionId !== state.sessionId) {
    await chrome.storage.local.remove("activeVisit");
    active = null;
  }
  // Ignore duplicate complete/activation events for the same tab and domain.
  if (active && active.tabId === tab.id && active.domain === domain && active.sessionId === state.sessionId) {
    await chrome.storage.local.set({ currentDomain: domain });
    debugLog("VISIT_UNCHANGED", { domain, tabId: tab.id });
    return;
  }
  const events = [];
  if (active) events.push(newEvent(state, "VISIT_END", active));
  const visit = { visitId: crypto.randomUUID(), tabId: tab.id, domain, startedAt: new Date().toISOString(), sessionId: state.sessionId };
  events.push(newEvent(state, "VISIT_START", visit, visit.startedAt));
  await enqueueEvents(events, state);
  await chrome.storage.local.set({ activeVisit: visit, currentDomain: domain });
  debugLog("VISIT_STARTED", { domain, tabId: tab.id, visitId: visit.visitId, startedAt: visit.startedAt });
  void flushQueue();
}
async function reconcileScreenshotAlarm() {
  const state = await getState();
  if (!isConnected(state)) {
    await chrome.alarms.clear(SCREENSHOT_ALARM);
    return false;
  }
  const apiBaseUrl = String(state.apiBaseUrl || DEFAULT_API).trim().replace(/\/+$/, "");
  try {
    debugLog("SCREENSHOT_POLICY_REQUEST", { endpoint: `${apiBaseUrl}/screenshots/policy`, hasToken: Boolean(state.extensionToken), hasSessionId: Boolean(state.sessionId) });
    const response = await fetch(`${apiBaseUrl}/screenshots/policy`, { headers: { Authorization: `Bearer ${state.extensionToken}` } });
    const rawBody = await response.text();
    let data = {};
    try { data = rawBody ? JSON.parse(rawBody) : {}; } catch { data = { nonJsonResponse: rawBody.slice(0, 300) }; }
    debugLog("SCREENSHOT_POLICY_RESPONSE", { status: response.status, ok: response.ok, contentType: response.headers.get("content-type"), hasPolicy: Boolean(data.policy), message: data.message || null, requestId: data.requestId || response.headers.get("x-request-id") || null });
    if ([401, 403, 409].includes(response.status)) {
      await chrome.alarms.clear(SCREENSHOT_ALARM);
      const reason = data.message || `Screenshot policy request rejected (${response.status}).`;
      await chrome.storage.local.set({ screenshotPolicy: null, screenshotStatus: `Policy check failed (${response.status}): ${reason}` });
      if (response.status === 409) await clearInvalidConnection(data.message || "Work session ended.");
      return false;
    }
    if (!response.ok || !data.policy) {
      await chrome.alarms.clear(SCREENSHOT_ALARM);
      await chrome.storage.local.set({ screenshotPolicy: null, screenshotStatus: `Policy unavailable (${response.status}): ${data.message || (data.nonJsonResponse ? "Server returned non-JSON response" : "Response did not contain a policy")}` });
      return false;
    }
    await chrome.storage.local.set({ screenshotPolicy: data.policy });
    await applyIdleThreshold(data.policy);
    if (!data.policy.enabled) {
      await chrome.alarms.clear(SCREENSHOT_ALARM);
      await chrome.storage.local.set({ screenshotStatus: "Screenshot monitoring is disabled by your organization." });
      return false;
    }
    if (!state.screenshotPermissionGranted) {
      await chrome.alarms.clear(SCREENSHOT_ALARM);
      await chrome.storage.local.set({ screenshotStatus: "Monitoring is enabled by policy; site access requires your explicit approval." });
      return false;
    }
    const existing = await chrome.alarms.get(SCREENSHOT_ALARM);
    const expectedPeriod = Math.max(0.5, data.policy.intervalSeconds / 60);
    if (!existing || Math.abs((existing.periodInMinutes || 0) - expectedPeriod) > 0.01) {
      await chrome.alarms.clear(SCREENSHOT_ALARM);
      await chrome.alarms.create(SCREENSHOT_ALARM, { periodInMinutes: expectedPeriod });
    }
    await chrome.storage.local.set({ screenshotStatus: `Enabled: visible-tab capture every ${data.policy.intervalSeconds}s.` });
    return true;
  } catch (error) {
    await chrome.alarms.clear(SCREENSHOT_ALARM);
    const message = error instanceof Error ? error.message : String(error);
    await chrome.storage.local.set({ screenshotPolicy: null, screenshotStatus: `Policy request failed: ${message}` });
    debugLog("SCREENSHOT_POLICY_ERROR", { error: message, endpoint: `${apiBaseUrl}/screenshots/policy` });
    return false;
  }
}

async function captureScreenshotTick() {
  const state = await getState();
  if (!isConnected(state) || !state.screenshotPermissionGranted) { await chrome.alarms.clear(SCREENSHOT_ALARM); return; }
  const apiBaseUrl = String(state.apiBaseUrl || DEFAULT_API).trim().replace(/\/+$/, "");
  try {
    // Refresh policy on every scheduled tick; fail closed when policy cannot be verified.
    debugLog("SCREENSHOT_TICK_BEGIN", { endpoint: `${apiBaseUrl}/screenshots/policy`, idleState: state.browserIdleState || "unknown", breakActive: Boolean(state.breakActive), permissionGranted: Boolean(state.screenshotPermissionGranted) });
    const policyResponse = await fetch(`${apiBaseUrl}/screenshots/policy`, { headers: { Authorization: `Bearer ${state.extensionToken}` } });
    const policyRawBody = await policyResponse.text();
    let policyData = {};
    try { policyData = policyRawBody ? JSON.parse(policyRawBody) : {}; } catch { policyData = { nonJsonResponse: policyRawBody.slice(0, 300) }; }
    debugLog("SCREENSHOT_TICK_POLICY_RESPONSE", { status: policyResponse.status, ok: policyResponse.ok, hasPolicy: Boolean(policyData.policy), enabled: policyData.policy?.enabled, message: policyData.message || null, requestId: policyData.requestId || policyResponse.headers.get("x-request-id") || null });
    if (!policyResponse.ok || !policyData.policy?.enabled) {
      await chrome.alarms.clear(SCREENSHOT_ALARM);
      await chrome.storage.local.set({ screenshotPolicy: policyData.policy || null, screenshotStatus: `Capture paused: policy check returned ${policyResponse.status}. ${policyData.message || (policyData.nonJsonResponse ? "Server returned non-JSON response." : "Policy is missing or disabled.")}` });
      return;
    }
    const policy = policyData.policy;
    await chrome.storage.local.set({ screenshotPolicy: policy });
    await applyIdleThreshold(policy);
    if (policy.pauseDuringBreaks && policyData.breakActive) { debugLog("SCREENSHOT_SKIPPED", { reason: "server-reported-break" }); await chrome.storage.local.set({ screenshotStatus: "Screenshot capture paused during an active break." }); return; }
    const currentAlarm = await chrome.alarms.get(SCREENSHOT_ALARM);
    const expectedPeriod = Math.max(0.5, policy.intervalSeconds / 60);
    if (!currentAlarm || Math.abs((currentAlarm.periodInMinutes || 0) - expectedPeriod) > 0.01) {
      await chrome.alarms.clear(SCREENSHOT_ALARM);
      await chrome.alarms.create(SCREENSHOT_ALARM, { periodInMinutes: expectedPeriod });
    }
    if (policy.pauseDuringIdle && state.browserIdleState !== "active") { debugLog("SCREENSHOT_SKIPPED", { reason: "extension-idle-state", idleState: state.browserIdleState || "unknown" }); await chrome.storage.local.set({ screenshotStatus: `Capture paused: browser state is ${state.browserIdleState || "unknown"}.` }); return; }
    if (policy.pauseDuringBreaks && state.breakActive) { debugLog("SCREENSHOT_SKIPPED", { reason: "extension-break-state" }); await chrome.storage.local.set({ screenshotStatus: "Screenshot capture paused during an active break." }); return; }
    const hasPermission = await chrome.permissions.contains({ origins: ["<all_urls>"] });
    debugLog("SCREENSHOT_PERMISSION_CHECK", { allUrlsGranted: hasPermission, storedPermissionFlag: Boolean(state.screenshotPermissionGranted) });
    if (!hasPermission) {
      debugLog("SCREENSHOT_SKIPPED", { reason: "host-permission-missing" });
      await chrome.storage.local.set({ screenshotPermissionGranted: false, screenshotStatus: "Site permission was revoked; screenshot capture paused." });
      await chrome.alarms.clear(SCREENSHOT_ALARM);
      return;
    }
    const focused = await chrome.windows.getLastFocused({ populate: false });
    if (!focused?.focused) { debugLog("SCREENSHOT_SKIPPED", { reason: "no-focused-window" }); return; }
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !Number.isInteger(tab.windowId) || !tab.url || !["http:", "https:"].includes(new URL(tab.url).protocol)) { debugLog("SCREENSHOT_SKIPPED", { reason: "no-capturable-active-tab", tabId: tab?.id, windowId: tab?.windowId, hasUrl: Boolean(tab?.url) }); return; }
    const domain = new URL(tab.url).hostname.toLowerCase();
    const excluded = (policy.excludedDomains || []).some(entry => domain === entry || domain.endsWith(`.${entry}`));
    if (excluded) { debugLog("SCREENSHOT_SKIPPED", { reason: "excluded-domain", domain }); return; }
    debugLog("SCREENSHOT_CAPTURE_BEGIN", { domain, tabId: tab.id, windowId: tab.windowId, captureScope: policy.captureScope, allUrlsPermissionConfirmed: hasPermission });
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 55 });
    const blob = await (await fetch(dataUrl)).blob();
    if (blob.size > 2 * 1024 * 1024) {
      await chrome.storage.local.set({ screenshotStatus: "Screenshot exceeded the 2 MB upload limit; capture skipped." });
      return;
    }
    const capturedAt = new Date().toISOString();
    const captureId = crypto.randomUUID();
    const form = new FormData();
    form.append("image", blob, `${captureId}.jpg`);
    form.append("captureId", captureId);
    form.append("capturedAt", capturedAt);
    form.append("captureScope", "visible-tab");
    form.append("tabDomain", domain);
    const response = await fetch(`${apiBaseUrl}/screenshots`, { method: "POST", headers: { Authorization: `Bearer ${state.extensionToken}` }, body: form });
    const data = await response.json().catch(() => ({}));
    if ([401, 403].includes(response.status)) {
      await chrome.storage.local.set({ screenshotStatus: data.message || "Screenshot upload rejected; session authorization needs attention." });
      await chrome.alarms.clear(SCREENSHOT_ALARM);
      return;
    }
    if (response.status === 409) {
      await chrome.storage.local.set({ screenshotStatus: data.message || "Capture paused by server session policy." });
      return;
    }
    if (response.status === 204) { await chrome.storage.local.set({ screenshotStatus: `Capture skipped for excluded domain ${domain}.` }); return; }
    if (!response.ok) { debugLog("SCREENSHOT_UPLOAD_REJECTED", { status: response.status, domain, message: data.message || null, requestId: data.requestId || response.headers.get("x-request-id") || null }); throw new Error(data.message || `Upload failed (${response.status})`); }
    await chrome.storage.local.set({ lastScreenshotAt: capturedAt, screenshotStatus: `Last screenshot saved at ${new Date(capturedAt).toLocaleTimeString()}.` });
    debugLog("SCREENSHOT_UPLOAD_RESPONSE", { status: response.status, domain, bytes: blob.size, requestId: data.requestId || response.headers.get("x-request-id") || null });
  } catch (error) {
    await chrome.storage.local.set({ screenshotStatus: "Screenshot capture/upload failed; it will retry on a later interval." });
    debugLog("SCREENSHOT_CAPTURE_ERROR", { error: String(error) });
  }
}

async function inspect(reason = "manual-inspect") {
  const state = await getState();
  if (!isConnected(state)) return;
  const browserFocused = await refreshBrowserFocusState();
  if (!browserFocused) {
    debugLog("INSPECT_SKIPPED", { reason, skipReason: "window-unfocused" });
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  debugLog("INSPECT", { reason, tabId: tab?.id, url: tab?.url, browserFocused });
  await activateTab(tab, reason);
}
async function heartbeat() {
  const state = await getState();
  if (!state.extensionToken || !state.sessionId) return false;
  const apiBaseUrl = String(state.apiBaseUrl || DEFAULT_API).trim().replace(/\/+$/, "");
  try {
    const response = await fetch(`${apiBaseUrl}/tracking/heartbeat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${state.extensionToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ browserState: state.browserIdleState || "unknown" })
    });
    const data = await response.json().catch(() => ({}));
    debugLog("HEARTBEAT_RESPONSE", { status: response.status, ok: response.ok, message: data.message, breakActive: data.breakActive });
    if ([401, 403, 409].includes(response.status)) {
      await clearInvalidConnection(data.message || "Session expired. Start a work session and reconnect.");
      return false;
    }
    if (!response.ok) {
      await chrome.storage.local.set({ uploadStatus: `Heartbeat failed (${response.status}); will retry.` });
      return false;
    }
    const isOnBreak = Boolean(data.breakActive);
    const breakStateChanged = Boolean(state.breakActive) !== isOnBreak;
    await chrome.storage.local.set({
      ...(isOnBreak ? { currentDomain: null } : {}),
      breakActive: isOnBreak,
      lastHeartbeatAt: data.lastHeartbeatAt,
      uploadStatus: isOnBreak ? "Connected; tracking paused during your break." : "Connected; session heartbeat healthy."
    });
    if (isOnBreak) {
      await closeActiveVisit(state, "break");
      await chrome.storage.local.set({ currentDomain: null });
    }
    if (breakStateChanged) await syncIdleOverlayForTab();
    return !isOnBreak;
  } catch (error) {
    debugLog("HEARTBEAT_ERROR", { error: String(error) });
    await chrome.storage.local.set({ uploadStatus: "API unreachable; queued events will retry." });
    return false;
  }
}
async function flushQueue({ skipHeartbeat = false } = {}) {
  if (flushInFlight) {
    debugLog("SYNC_DEDUPLICATED", { reason: "upload-already-running" });
    return flushInFlight;
  }
  flushInFlight = flushQueueInternal({ skipHeartbeat });
  try { return await flushInFlight; }
  finally { flushInFlight = null; }
}
async function flushQueueInternal({ skipHeartbeat = false } = {}) {
  const state = await getState();
  if (!state.extensionToken || !state.sessionId) return;
  const apiBaseUrl = String(state.apiBaseUrl || DEFAULT_API).trim().replace(/\/+$/, "");
  if (!skipHeartbeat) {
    const canTrack = await heartbeat();
    if (!canTrack) return;
  }
  const latest = await chrome.storage.local.get(["eventQueue"]);
  const queue = Array.isArray(latest.eventQueue) ? latest.eventQueue : [];
  const currentQueue = queue.filter(event => event.sessionId === state.sessionId);
  if (currentQueue.length !== queue.length) await chrome.storage.local.set({ eventQueue: currentQueue });
  if (!currentQueue.length) {
    await chrome.storage.local.set({ uploadStatus: "Connected; no pending visits to sync.", lastSyncAt: new Date().toISOString() });
    debugLog("SYNC_NO_EVENTS");
    return;
  }
  const batch = currentQueue.slice(0, 50);
  try {
    debugLog("BATCH_UPLOAD_REQUEST", { endpoint: `${apiBaseUrl}/tracking/events/batch`, batchSize: batch.length });
    const response = await fetch(`${apiBaseUrl}/tracking/events/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.extensionToken}` },
      body: JSON.stringify({ events: batch })
    });
    const data = await response.json().catch(() => ({}));
    debugLog("BATCH_UPLOAD_RESPONSE", { status: response.status, ok: response.ok, acceptedCount: data.acceptedCount, rejected: data.rejected });
    if ([401, 403, 409].includes(response.status)) {
      await clearInvalidConnection(data.message || "Reconnect after starting a new work session.");
      return;
    }
    if (!response.ok) {
      await chrome.storage.local.set({ uploadStatus: `Upload failed (${response.status}); will retry.` });
      return;
    }
    const accepted = new Set(data.acceptedEventIds || []);
    const rejected = new Set((data.rejected || []).map(event => event.eventId).filter(Boolean));
    const remaining = currentQueue.filter(event => !accepted.has(event.eventId) && !rejected.has(event.eventId));
    await chrome.storage.local.set({
      eventQueue: remaining,
      uploadStatus: `Synced ${accepted.size}; rejected ${rejected.size}; queued ${remaining.length}.`,
      lastSyncAt: new Date().toISOString()
    });
    debugLog("SYNC_FINISHED", { accepted: accepted.size, rejected: rejected.size, remaining: remaining.length });
  } catch (error) {
    debugLog("BATCH_UPLOAD_ERROR", { error: String(error) });
    await chrome.storage.local.set({ uploadStatus: "API unreachable; queued visits will retry." });
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void serial(async () => { try { await activateTab(await chrome.tabs.get(tabId), "tab-activated"); } catch (e) { debugLog("TAB_ACTIVATION_ERROR", { error: String(e) }); } });
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === "complete") {
    void serial(async () => {
      try {
        const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (active?.id === tabId) await activateTab(tab, info.url ? "navigation" : "page-loaded", typeof info.url === "string" ? info.url : undefined);
      } catch (e) { debugLog("TAB_UPDATE_ERROR", { error: String(e) }); }
    });
  }
});
// Capture committed top-level navigations as a second signal. This helps ensure
// domain exits are finalized even when tabs.onUpdated timing differs by site.
chrome.webNavigation.onCommitted.addListener(details => {
  if (details.frameId !== 0 || details.tabId < 0) return;
  void serial(async () => {
    try {
      const tab = await chrome.tabs.get(details.tabId);
      if (tab.active) await activateTab({ ...tab, url: details.url }, "navigation-committed", details.url);
    } catch (e) { debugLog("NAVIGATION_COMMITTED_ERROR", { error: String(e), tabId: details.tabId }); }
  });
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void serial(async () => {
    const state = await getState();
    if (state.activeVisit?.tabId === tabId) {
      await closeActiveVisit(state, "tab-closed");
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await activateTab(tab, "after-tab-closed");
      void flushQueue();
    }
  });
});
chrome.windows.onFocusChanged.addListener(windowId => {
  void serial(async () => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      await chrome.storage.local.set({ browserFocused: false, currentDomain: null });
      await closeActiveVisit(await getState(), "window-unfocused");
      void flushQueue();
      return;
    }
    await chrome.storage.local.set({ browserFocused: true });
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    await activateTab(tab, "window-focused");
  });
});
chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);
chrome.idle.onStateChanged.addListener(stateName => {
  void serial(async () => {
    const state = await getState();
    // The API may report state changes while disconnected; do not create tracking events.
    await chrome.storage.local.set({ browserIdleState: stateName, browserIdleChangedAt: new Date().toISOString(), ...(stateName !== "active" ? { currentDomain: null } : {}) });
    if (!isConnected(state)) {
      await syncIdleOverlayForTab();
      return;
    }
    const changedAt = new Date();
    if (stateName === "active") {
      await endIdleInterval(await getState(), "user-active", changedAt);
      await inspect("browser-active");
      void flushQueue();
    } else {
      const estimatedIdleStart = stateName === "idle"
        ? new Date(changedAt.getTime() - IDLE_THRESHOLD_SECONDS * 1000)
        : changedAt;
      // End the current website visit at the idle boundary so website and idle
      // intervals do not overlap in the dashboard or totals.
      await closeActiveVisit(await getState(), `browser-${stateName}`, estimatedIdleStart);
      await chrome.storage.local.set({ currentDomain: null });
      await startIdleInterval(stateName, changedAt);
      void flushQueue();
    }
    await syncIdleOverlayForTab();
  });
});
async function connectFromAppSession(appOrigin = APP_URL) {
  const apiBaseUrl = String((await chrome.storage.local.get("apiBaseUrl")).apiBaseUrl || DEFAULT_API).trim().replace(/\/+$/, "");
  const cookie = await chrome.cookies.get({ url: appOrigin, name: "tracker_token" });
  if (!cookie?.value) {
    debugLog("APP_SESSION_CONNECT_SKIPPED", { reason: "signed-in-cookie-not-found" });
    return false;
  }
  const response = await fetch(`${apiBaseUrl}/auth/extension-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cookie.value}` },
    body: "{}"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    debugLog("APP_SESSION_CONNECT_FAILED", { status: response.status, message: data.message || "request-failed" });
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#b45309" });
    await chrome.action.setTitle({ title: "Trackwise — session active, extension needs attention" });
    return false;
  }
  await chrome.storage.local.set({
    apiBaseUrl,
    extensionToken: data.token,
    sessionId: data.sessionId,
    employeeName: data.user?.name || data.user?.email || "Employee",
    breakActive: false,
    uploadStatus: "Connected automatically after starting your Trackwise work session."
  });
  const connected = await connectTracking();
  debugLog("APP_SESSION_CONNECT_RESULT", { connected, sessionIdPresent: Boolean(data.sessionId) });
  return connected;
}

async function initializeExtension() {
  const connected = await reconcileSyncAlarm();
  await reconcileScreenshotAlarm();
  const stored = await getState();
  await applyIdleThreshold(stored.screenshotPolicy);
  const stateName = await chrome.idle.queryState(IDLE_THRESHOLD_SECONDS);
  await chrome.storage.local.set({ browserIdleState: stateName });
  if (!connected) {
    // Stale intervals must not leak into a later work session.
    await chrome.storage.local.remove(["activeVisit", "activeIdle"]);
    await syncIdleOverlayForTab();
    return;
  }
  if (stateName === "idle" || stateName === "locked") {
    const detectedAt = new Date();
    const estimatedIdleStart = stateName === "idle" ? new Date(detectedAt.getTime() - IDLE_THRESHOLD_SECONDS * 1000) : detectedAt;
    await closeActiveVisit(await getState(), `browser-${stateName}-initial-state`, estimatedIdleStart);
    await chrome.storage.local.set({ currentDomain: null });
    await startIdleInterval(stateName, detectedAt);
    void flushQueue();
  } else {
    await endIdleInterval(await getState(), "active-on-startup", new Date());
    await inspect("active-on-startup");
  }
  await syncIdleOverlayForTab();
}
chrome.runtime.onInstalled.addListener(() => { void serial(initializeExtension); });
chrome.runtime.onStartup.addListener(() => { void serial(initializeExtension); });
// A service-worker restart should restore the alarm only if a connection is still stored.
void serial(initializeExtension);
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SCREENSHOT_ALARM) {
    serial(captureScreenshotTick);
    return;
  }
  if (alarm.name !== SYNC_ALARM) return;
  void serial(async () => {
    const state = await getState();
    if (!isConnected(state)) {
      await chrome.alarms.clear(SYNC_ALARM);
      debugLog("SYNC_SKIPPED", { reason: "extension-disconnected" });
      return;
    }
    const canTrack = await heartbeat();
    if (!canTrack) return;
    await refreshIdleThresholdPolicy();
    const refreshed = await getState();
    // Reconcile focus on the background alarm too. Otherwise a transient WINDOW_ID_NONE
    // event can leave browserFocused=false in storage and block visits indefinitely even
    // after Chrome is focused again (screenshots and tab-switch events use separate paths).
    const browserFocused = await refreshBrowserFocusState();
    // Keep the session heartbeat alive while idle, but do not inspect active tabs
    // or create website visits until Chrome reports system activity again.
    if (refreshed.browserIdleState === "idle" || refreshed.browserIdleState === "locked") {
      debugLog("PERIODIC_INSPECT_SKIPPED", { reason: refreshed.browserIdleState });
    } else if (!browserFocused) {
      debugLog("PERIODIC_INSPECT_SKIPPED", { reason: "window-unfocused" });
    } else {
      await inspect("periodic-sync");
    }
    await flushQueue({ skipHeartbeat: true });
  });
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "TRACKWISE_PREPARE_SESSION_END") {
    const allowedOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
    const senderOrigin = (() => { try { return new URL(sender?.url || "").origin; } catch { return ""; } })();
    if (!allowedOrigins.has(senderOrigin) || message.origin !== senderOrigin) {
      sendResponse({ ok: false, reason: "untrusted-origin", connected: false });
      return false;
    }
    serial(async () => {
      let state = await getState();
      if (!isConnected(state)) return { ok: true, connected: false, pendingCount: 0 };
      // Finalize the open intervals and upload while the server still considers
      // this work session active. Ending the API session first causes late events
      // to be rejected and loses short visits/tab switches.
      await closeActiveVisit(state, "work-session-ending");
      state = await getState();
      await endIdleInterval(state, "work-session-ending");
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await flushQueue();
        const latest = await chrome.storage.local.get(["eventQueue", "sessionId"]);
        const pending = Array.isArray(latest.eventQueue)
          ? latest.eventQueue.filter(event => event.sessionId === latest.sessionId).length
          : 0;
        if (pending === 0) {
          debugLog("SESSION_END_PREPARED", { attempts: attempt + 1, pendingCount: 0 });
          return { ok: true, connected: true, pendingCount: 0 };
        }
      }
      const latest = await chrome.storage.local.get(["eventQueue", "sessionId"]);
      const pendingCount = Array.isArray(latest.eventQueue)
        ? latest.eventQueue.filter(event => event.sessionId === latest.sessionId).length
        : 0;
      debugLog("SESSION_END_PREPARE_INCOMPLETE", { pendingCount });
      return { ok: pendingCount === 0, connected: true, pendingCount };
    }).then(result => sendResponse(result)).catch(error => {
      debugLog("SESSION_END_PREPARE_ERROR", { error: String(error) });
      sendResponse({ ok: false, connected: true, pendingCount: -1, reason: "flush-failed" });
    });
    return true;
  }
  if (message?.type === "TRACKWISE_SESSION_ENDED") {
    const allowedOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
    const senderOrigin = (() => { try { return new URL(sender?.url || "").origin; } catch { return ""; } })();
    if (!allowedOrigins.has(senderOrigin) || message.origin !== senderOrigin) {
      sendResponse({ ok: false, reason: "untrusted-origin" });
      return false;
    }
    serial(async () => {
      const state = await getState();
      if (isConnected(state)) await clearInvalidConnection("Work session ended in Trackwise. Browser tracking stopped.");
      else { await chrome.alarms.clear(SYNC_ALARM); await chrome.alarms.clear(SCREENSHOT_ALARM); }
      debugLog("SESSION_END_SIGNAL_RECEIVED", { origin: senderOrigin });
    }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "TRACKWISE_SCREENSHOT_PERMISSION_GRANTED") {
    serial(reconcileScreenshotAlarm).then(ok => sendResponse({ ok: Boolean(ok) })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "TRACKWISE_SESSION_STARTED") {
    const allowedOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
    const senderOrigin = (() => { try { return new URL(sender?.url || "").origin; } catch { return ""; } })();
    if (!allowedOrigins.has(senderOrigin) || message.origin !== senderOrigin) {
      sendResponse({ ok: false, reason: "untrusted-origin" });
      return false;
    }
    serial(() => connectFromAppSession(senderOrigin)).then(ok => sendResponse({ ok: Boolean(ok) })).catch(error => {
      debugLog("APP_SESSION_CONNECT_ERROR", { error: String(error) });
      sendResponse({ ok: false });
    });
    return true;
  }
  if (message?.type === "TRACKWISE_CONNECT") {
    serial(connectTracking).then(ok => sendResponse({ ok: Boolean(ok) })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "TRACKWISE_DISCONNECT") {
    serial(disconnectTracking).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "TRACKWISE_SYNC") {
    serial(async () => {
      const state = await getState();
      if (!isConnected(state)) return;
      await inspect("manual-sync");
      await flushQueue();
    }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === "TRACKWISE_INSPECT") {
    serial(async () => {
      if (isConnected(await getState())) await inspect("popup-inspect");
    }).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});
