import { I } from "./icons.jsx";
import { signOut } from "./lib/auth.js";

function navClass(active) {
  return "nav-link" + (active ? " active" : "");
}

export function Topbar({ user, screen }) {
  const screenTitle =
    screen === "users" ? "Users" : screen === "plans" ? "Plans" : screen === "settings" ? "Settings" : "Workers";
  return (
    <header className="topbar">
      <div className="brand" aria-label="Pullwise Admin">
        <img className="brand-mark" src="/favicon.ico" alt="" aria-hidden="true" width="28" height="28" />
        <div>
          <strong>Pullwise Admin</strong>
          <span>{screenTitle}</span>
        </div>
      </div>
      <nav className="topbar-nav" aria-label="Admin navigation">
        <a className={navClass(screen === "workers")} href="/workers">
          <I.Server size={14} /> Workers
        </a>
        <a className={navClass(screen === "users")} href="/users">
          <I.Users size={14} /> Users
        </a>
        <a className={navClass(screen === "plans")} href="/plans">
          <I.Settings size={14} /> Plans
        </a>
        <a className={navClass(screen === "settings")} href="/settings">
          <I.Shield size={14} /> Settings
        </a>
      </nav>
      <div className="topbar-actions">
        {user?.email && <span className="muted">{user.email}</span>}
        <button className="btn ghost sm" type="button" onClick={signOut}>
          <I.LogOut size={14} /> Sign out
        </button>
      </div>
    </header>
  );
}
