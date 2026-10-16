import { LogIn } from "lucide-react";
export default function LoginPage({
  email,
  password,
  setEmail,
  setPassword,
  busy,
  login,
  loginWithCredentials,
  demoAccounts,
  error,
}) {
  return (
    <section className="login-layout">
      <div className="welcome">
        <span className="pill">EMPLOYEE WORKSPACE</span>
        <h2>
          Make work time
          <br />
          <em>clear and accountable.</em>
        </h2>
        <p>Sessions, breaks, and browser activity in one workspace.</p>
      </div>
      <form className="card" onSubmit={login}>
        <span className="mark">
          <LogIn />
        </span>
        <h2>Welcome back</h2>
        <p>Sign in with your workspace account.</p>
        {error && (
          <div className="login-error" role="alert">
            <b>Sign-in failed</b>
            <span>{error}</span>
            <small>
              Check the credentials and confirm the backend is running at the
              configured API address.
            </small>
          </div>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <button className="btn primary full" disabled={busy}>
          {busy ? "Please wait…" : "Sign in"}
        </button>
        {import.meta.env.DEV && (
          <>
            <div className="demo-divider">
              <span>LOCAL DEMO ACCOUNTS</span>
            </div>
            <div className="demo-buttons">
              {demoAccounts.map((account) => (
                <button
                  type="button"
                  className="demo-btn"
                  key={account.role}
                  disabled={busy}
                  onClick={() =>
                    void loginWithCredentials(account.email, account.password)
                  }
                >
                  <span className={`avatar ${account.role.toLowerCase()}`}>
                    {account.role[0]}
                  </span>
                  <span>
                    <b>{account.label}</b>
                    <small>{account.role} demo account</small>
                  </span>
                  <LogIn size={15} />
                </button>
              ))}
            </div>
            <p className="demo-warning">
              Demo logins require running <code>npm run seed:demo</code> in the
              server folder.
            </p>
          </>
        )}
      </form>
    </section>
  );
}
