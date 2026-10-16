import { AlertCircle, CheckCircle2, Info, LogOut, X } from "lucide-react";
import Sidebar from "./components/layout/Sidebar";
import LoginPage from "./components/auth/LoginPage";
import RouteOutlet from "./components/routing/RouteOutlet";
import { useTrackwiseController } from "./hooks/useTrackwiseController";
export default function App() {
    const { loading, user, message, setMessage, section, setSection, setSelectedEmployeeId, email, password, setEmail, setPassword, busy, login, loginWithCredentials, demoAccounts, loginError, screenshotImageUrl, setScreenshotImageUrl, screenshotImageLabel, setScreenshotImageLabel, logout, pageContext, } = useTrackwiseController();
    if (loading)
        return <div className="loading">Loading workspace…</div>;
    const isError = /failed|could not|error|unable|invalid|no data|cannot reach|network/i.test(message);
    const isSuccess = /saved|signed in|signed out|created|updated|deleted|success/i.test(message);
    return (<div className={`shell ${user ? "workspace-shell" : "login-shell"}`}>
      {user && <Sidebar user={user} section={section} setSection={setSection} setSelectedEmployeeId={setSelectedEmployeeId}/>}
      {message && <div className="toast-viewport" aria-live="polite" aria-atomic="true">
        <div className={`app-toast ${isError ? "toast-error" : isSuccess ? "toast-success" : "toast-info"}`} role={isError ? "alert" : "status"}>
          {isError ? <AlertCircle size={20}/> : isSuccess ? <CheckCircle2 size={20}/> : <Info size={20}/>}
          <span>{message}</span>
          <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={() => setMessage("")}><X size={16}/></button>
          <span className="toast-progress"/>
        </div>
      </div>}
      <main className={`main ${user ? "workspace-main" : "login-main"}`}>
        {user && <header>
          <div><small>EMPLOYEE ACTIVITY PLATFORM</small><h1>{section === "Activity analytics" ? (user.role === "employee" ? "My activity" : "Employee analytics") : section === "Break analytics" ? "Employee break details" : section === "Attendance" ? "Sessions" : section}</h1></div>
          <div className="header-actions"><span className="role">{user.name}</span><button className="btn ghost" onClick={logout} disabled={busy}><LogOut size={16}/> Sign out</button></div>
        </header>}
        {!user ? <LoginPage email={email} password={password} setEmail={setEmail} setPassword={setPassword} busy={busy} login={login} loginWithCredentials={loginWithCredentials} demoAccounts={demoAccounts} error={loginError}/> : <RouteOutlet section={section} ctx={pageContext}/>}
        {screenshotImageUrl && <div className="screenshot-modal" role="dialog" aria-modal="true" aria-label="Screenshot viewer"><div className="screenshot-modal-card"><div className="panel-heading"><div><h3>Screenshot</h3><p className="muted">{screenshotImageLabel}</p></div><button className="btn secondary" onClick={() => { setScreenshotImageUrl(""); setScreenshotImageLabel(""); }}>Close</button></div><img src={screenshotImageUrl} alt="Authorized employee visible-tab screenshot"/><p className="muted">Temporary access URL. Do not copy or share outside authorized review.</p></div></div>}
        <footer>Trackwise · Development workspace · Domain-only activity</footer>
      </main>
    </div>);
}
