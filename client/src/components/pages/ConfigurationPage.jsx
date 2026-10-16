export default function ConfigurationPage({ ctx }) {
    const { Camera, Gauge, Info, RefreshCw, Settings, ShieldCheck, busy, events, excludedDomainsText, from, refresh, refreshSection, refreshingSection, rows, saveScreenshotPolicy, screenshotPolicy, section, setExcludedDomainsText, setScreenshotPolicy, to, user } = ctx;
    return (<>{section === "Configuration" && user.role === "admin" && <section className="card section-panel screenshot-settings-page configuration-page"><div className="panel-heading"><div><Settings /><h2>Configuration</h2></div><button className="btn secondary" disabled={refreshingSection === "Configuration"} onClick={() => void refreshSection("Configuration")}><RefreshCw size={15} className={refreshingSection === "Configuration" ? "spin" : ""}/> {refreshingSection === "Configuration" ? "Refreshing…" : "Refresh settings"}</button></div><p className="muted">Manage browser screenshot capture, retention, and the inactivity threshold used by the Chrome extension.</p><p className="muted">Controls apply to active Chrome extension sessions. Capture is limited to the visible browser tab, not the full desktop. Employees should be informed before monitoring is enabled.</p><form className="user-form configuration-form" onSubmit={saveScreenshotPolicy}>
  <div className="config-enable-card">
    <label className="toggle-line config-master-toggle"><input type="checkbox" checked={Boolean(screenshotPolicy.enabled)} onChange={e => setScreenshotPolicy((p) => ({ ...p, enabled: e.target.checked }))}/><span><strong>Enable screenshot monitoring</strong><small>When enabled, the extension may capture and upload the visible Chrome tab according to the settings below. When disabled, screenshot capture stops; domain and activity tracking continue.</small></span></label>
    <span className={`config-state-pill ${screenshotPolicy.enabled ? "is-enabled" : "is-disabled"}`}>{screenshotPolicy.enabled ? "Monitoring enabled" : "Monitoring disabled"}</span>
  </div>
  <div className="config-setting-card screenshot-config-card">
    <div className="configuration-subheading"><Camera /><div><h3>Screenshot capture</h3><p className="muted">Choose when screenshots are captured and how long they are retained. Only the visible Chrome tab is captured.</p></div></div>
    <div className="form-grid config-capture-grid">
      <label>Capture interval<select value={screenshotPolicy.intervalSeconds} onChange={e => setScreenshotPolicy((p) => ({ ...p, intervalSeconds: Number(e.target.value) }))}><option value={30}>Every 30 seconds</option><option value={60}>Every 60 seconds</option><option value={120}>Every 2 minutes</option><option value={300}>Every 5 minutes</option></select><small className="muted">How often an eligible screenshot is taken.</small></label>
      <label>Delete screenshots after<select value={screenshotPolicy.retentionDays} onChange={e => setScreenshotPolicy((p) => ({ ...p, retentionDays: Number(e.target.value) }))}><option value={1}>1 day</option><option value={2}>2 days</option><option value={3}>3 days</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select><small className="muted">Expired images are removed from Cloudinary and MongoDB by the hourly cleaner. This also recalculates expiry for existing screenshots.</small></label>
      <label>Capture scope<input value="Visible Chrome tab only" readOnly/><small className="muted">Trackwise does not capture the full desktop.</small></label>
    </div>
  </div>
  <div className="config-setting-card capture-behavior-card">
    <div className="configuration-subheading"><ShieldCheck /><div><h3>Capture conditions</h3><p className="muted">Temporarily pause screenshots when the employee is idle or on a break.</p></div></div>
    <div className="config-toggle-grid">
      <label className="toggle-option"><input type="checkbox" checked={Boolean(screenshotPolicy.pauseDuringIdle)} onChange={e => setScreenshotPolicy((p) => ({ ...p, pauseDuringIdle: e.target.checked }))}/><span><strong>Pause during idle</strong><small>Do not capture while Chrome reports the employee as idle.</small></span></label>
      <label className="toggle-option"><input type="checkbox" checked={Boolean(screenshotPolicy.pauseDuringBreaks)} onChange={e => setScreenshotPolicy((p) => ({ ...p, pauseDuringBreaks: e.target.checked }))}/><span><strong>Pause during breaks</strong><small>Do not capture during a recorded lunch or short break.</small></span></label>
    </div>
  </div>
  <div className="config-setting-card idle-config-card">
    <div className="configuration-subheading idle-threshold-heading"><Gauge /><div><h3>Idle detection threshold</h3><p className="muted">How long Chrome must be inactive before Trackwise records an idle interval.</p></div></div>
    <label className="idle-threshold-field">Mark browser as idle after<select value={Number(screenshotPolicy.idleThresholdSeconds || 60)} onChange={e => setScreenshotPolicy((p) => ({ ...p, idleThresholdSeconds: Number(e.target.value) }))}><option value={30}>30 seconds</option><option value={45}>45 seconds</option><option value={60}>60 seconds (recommended)</option><option value={90}>90 seconds</option><option value={120}>2 minutes</option><option value={180}>3 minutes</option><option value={300}>5 minutes</option></select><small className="muted">The Chrome extension applies this threshold after its next policy refresh. It affects new idle detections, not events already recorded.</small></label>
  </div>
  <div className="config-setting-card excluded-domains-card">
    <div className="configuration-subheading"><ShieldCheck /><div><h3>Privacy exclusions</h3><p className="muted">Domains listed here will not be captured by screenshot monitoring.</p></div></div>
    <label>Excluded domains (one domain per line)<textarea rows={4} value={excludedDomainsText} onChange={e => setExcludedDomainsText(e.target.value)} placeholder="bank.example.com&#10;private.example.org"/><small className="muted">Excluded domains are not captured. Enter hostnames only; do not use wildcards.</small></label>
  </div>
  <div className="actions config-save-actions"><button className="btn primary" disabled={busy}>Save configuration</button></div>
        </form><div className="notice"><Info size={16}/><span>Cloudinary credentials must be configured on the backend only. Screenshots are stored as authenticated assets; only admins and assigned managers can request temporary access links.</span></div></section>}</>);
}
