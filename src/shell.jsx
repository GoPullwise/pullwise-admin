import { I } from "./icons.jsx";
import { signOut } from "./lib/auth.js";

function navClass(active) {
  return "nav-link" + (active ? " active" : "");
}

const NAV_ITEMS = [
  { id: "workers", href: "/workers", label: "Workers", icon: I.Server },
  { id: "users", href: "/users", label: "Users", icon: I.Users },
  { id: "plans", href: "/plans", label: "Plans", icon: I.Settings },
  { id: "settings", href: "/settings", label: "Settings", icon: I.Shield },
];

export function Topbar({ user, screen }) {
  return (
    <header className="topbar">
      <a className="brand" href="/workers" aria-label="Pullwise Admin home">
        <img className="brand-mark" src="/favicon.ico" alt="" aria-hidden="true" width="28" height="28" />
        <strong>Pullwise Admin</strong>
      </a>
      <nav className="topbar-nav" aria-label="Admin navigation">
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
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
      <div className="topbar-footer">
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
