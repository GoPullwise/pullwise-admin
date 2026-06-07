import { I } from "./icons.jsx";
import { signOut } from "./lib/auth.js";

export function Topbar({ user }) {
  return (
    <header className="topbar">
      <div className="brand" aria-label="Pullwise Admin">
        <img className="brand-mark" src="/favicon.ico" alt="" aria-hidden="true" width="28" height="28" />
        <div>
          <strong>Pullwise Admin</strong>
          <span>Workers</span>
        </div>
      </div>
      <div className="topbar-actions">
        {user?.email && <span className="muted">{user.email}</span>}
        <button className="btn ghost sm" type="button" onClick={signOut}>
          <I.LogOut size={14} /> Sign out
        </button>
      </div>
    </header>
  );
}
