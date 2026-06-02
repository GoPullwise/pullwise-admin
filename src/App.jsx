import { useCallback, useEffect, useRef, useState } from "react";
import { pullwiseApi } from "./api/pullwise.js";
import { I } from "./icons.jsx";
import { startGitHubLogin, signOut } from "./lib/auth.js";
import { WorkersScreen } from "./screens/workers.jsx";
import { Topbar } from "./shell.jsx";
import "./app.css";

function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const login = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await startGitHubLogin();
    } catch (err) {
      setError(err?.message || "Unable to start GitHub login.");
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">PW</div>
          <strong>Pullwise Admin</strong>
        </div>
        <h1>Admin sign in</h1>
        <p>Use GitHub to sign in. The server decides admin access from configured emails or user IDs.</p>
        <button className="btn primary lg auth-gh" type="button" disabled={busy} onClick={login}>
          {busy ? <I.Refresh size={16} className="spin" /> : <I.Github size={16} />}
          Continue with GitHub
        </button>
        {error && (
          <div className="auth-error" role="alert">
            <I.X size={14} /> {error}
          </div>
        )}
      </div>
    </div>
  );
}

function AccessDenied({ session }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">PW</div>
          <strong>Pullwise Admin</strong>
        </div>
        <h1>Admin access required</h1>
        <p>
          {session?.user?.email || "This GitHub account"} is signed in, but it is not listed in the
          server admin allowlist.
        </p>
        <button className="btn" type="button" onClick={signOut}>
          <I.LogOut size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">PW</div>
          <strong>Pullwise Admin</strong>
        </div>
        <p className="loading-row">
          <I.Refresh size={16} className="spin" /> Checking admin session...
        </p>
      </div>
    </div>
  );
}

export function App() {
  const [auth, setAuth] = useState({ status: "checking", session: null });
  const abortRef = useRef(null);

  const checkSession = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAuth((current) => ({ ...current, status: "checking" }));
    try {
      const session = await pullwiseApi.auth.getSession({ signal: controller.signal });
      if (controller.signal.aborted) return;
      setAuth({ status: "ready", session: session || null });
    } catch {
      if (controller.signal.aborted) return;
      setAuth({ status: "ready", session: { authenticated: false } });
    }
  }, []);

  useEffect(() => {
    checkSession();
    return () => abortRef.current?.abort();
  }, [checkSession]);

  const session = auth.session;
  if (auth.status === "checking") return <LoadingScreen />;
  if (!session?.authenticated) return <LoginScreen />;
  if (!session?.admin) return <AccessDenied session={session} />;

  return (
    <div className="app">
      <Topbar user={session.user} />
      <WorkersScreen />
    </div>
  );
}
