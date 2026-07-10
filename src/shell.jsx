import { I } from "./icons.jsx";
import { signOut } from "./lib/auth.js";

function navClass(active) {
  return "nav-link" + (active ? " active" : "");
}

const NAV_ITEMS = [
  { id: "workers", href: "/workers", label: "Workers", description: "Fleet & runtime", icon: I.Server },
  { id: "users", href: "/users", label: "Users", description: "Access & usage", icon: I.Users },
  { id: "plans", href: "/plans", label: "Plans", description: "Policy & quota", icon: I.Settings },
  { id: "settings", href: "/settings", label: "Settings", description: "System control", icon: I.Shield },
];

export function Topbar({ user, screen }) {
  const screenTitle =
    screen === "users" ? "Users" : screen === "plans" ? "Plans" : screen === "settings" ? "Settings" : "Workers";
  return (
    <header className="topbar">
      <a className="brand" href="/workers" aria-label="Pullwise Admin home">
        <img className="brand-mark" src="/favicon.ico" alt="" aria-hidden="true" width="28" height="28" />
        <div>
          <strong>Pullwise Admin</strong>
          <span>Operations console</span>
        </div>
      </a>
      <div className="topbar-context" aria-label={`Current area: ${screenTitle}`}>
        <span>Control center</span>
        <strong>{screenTitle}</strong>
      </div>
      <nav className="topbar-nav" aria-label="Admin navigation">
        <span className="topbar-nav-label">Management</span>
        {NAV_ITEMS.map((item) => {
          const NavIcon = item.icon;
          const active = screen === item.id;
          return (
            <a
              className={navClass(active)}
              href={item.href}
              aria-current={active ? "page" : undefined}
              key={item.id}
            >
              <span className="nav-icon" aria-hidden="true">
                <NavIcon size={17} />
              </span>
              <span className="nav-copy">
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </a>
          );
        })}
      </nav>
      <div className="topbar-footer">
        <div className="topbar-access" aria-label="Restricted administrator workspace">
          <span className="access-indicator" aria-hidden="true" />
          <div>
            <strong>Admin access</strong>
            <small>Restricted workspace</small>
          </div>
        </div>
        <div className="topbar-actions">
          {user?.email && (
            <span className="muted" title={user.email}>
              {user.email}
            </span>
          )}
          <button className="btn ghost sm" type="button" onClick={signOut}>
            <I.LogOut size={14} /> Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
