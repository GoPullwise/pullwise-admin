import { useCallback, useEffect, useMemo, useState } from "react";
import { pullwiseApi } from "../api/pullwise.js";
import { I } from "../icons.jsx";

function itemsFrom(payload, ...keys) {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function textValue(value, fallback = "") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).replaceAll("\x00", "").split(/\r?\n|\r/, 1)[0].trim();
}

function formatTimestamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "Never";
  return new Date(number * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function lowerText(value, fallback = "") {
  return textValue(value, fallback).toLowerCase();
}

function statusLabel(value) {
  const text = textValue(value);
  if (!text || text === "none") return "";
  return text
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatBillingDate(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return new Date(number * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function subscriptionView(subscription) {
  const plan = lowerText(subscription?.plan, "free");
  const effectivePlan = lowerText(subscription?.effectivePlan, plan);
  const status = lowerText(subscription?.status, "none");
  const paidPlan = plan === "pro" || effectivePlan === "pro";
  const label = paidPlan ? ["Pro", statusLabel(status)].filter(Boolean).join(" ") : "Free";
  const periodEnd = Number(subscription?.currentPeriodEnd);
  const expired = Number.isFinite(periodEnd) && periodEnd > 0 && periodEnd <= Date.now() / 1000;
  const warning = ["canceling", "past_due", "unpaid", "paused"].includes(status);
  const active = paidPlan && ["active", "trialing"].includes(status) && !expired;
  const tone = active ? "active" : warning ? "warning" : paidPlan || status === "canceled" ? "inactive" : "free";
  const detail = [];
  const interval = lowerText(subscription?.interval);
  const date = formatBillingDate(subscription?.currentPeriodEnd);

  if (paidPlan) detail.push(interval === "year" ? "Yearly" : "Monthly");
  if (date) {
    const periodLabel =
      expired || status === "canceled"
        ? "Ended"
        : subscription?.cancelAtPeriodEnd === true || status === "canceling"
          ? "Ends"
          : "Renews";
    detail.push(`${periodLabel} ${date}`);
  }
  if (subscription?.provider) detail.push(statusLabel(subscription.provider));

  return { label, detail: detail.join(" - "), tone };
}

function UserRow({ user, pending, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const userId = textValue(user.id);
  const name = textValue(user.name, user.githubLogin || user.email || userId);
  const email = textValue(user.email);
  const githubLogin = textValue(user.githubLogin);
  const subscription = subscriptionView(user.subscription);
  const busy = pending === userId;

  return (
    <article className="user-row">
      <div className="user-main">
        {user.avatarUrl ? (
          <img className="user-avatar" src={user.avatarUrl} alt="" aria-hidden="true" />
        ) : (
          <span className="user-avatar fallback">
            <I.Users size={16} />
          </span>
        )}
        <span className="user-title">
          <strong>{name}</strong>
          <small>
            {githubLogin ? `@${githubLogin}` : userId}
            {email ? ` - ${email}` : ""}
          </small>
        </span>
      </div>
      <div className="user-meta">
        <span className={`subscription-pill ${subscription.tone}`}>{subscription.label}</span>
        {subscription.detail && <span>{subscription.detail}</span>}
        <span>{user.repositoryCount || 0} repos</span>
        <span>{user.scanCount || 0} scans</span>
        <span>{user.issueCount || 0} issues</span>
        <span>GitHub token {formatTimestamp(user.lastGitHubAccessTokenUpdatedAt)}</span>
      </div>
      <div className="user-actions">
        {user.admin && <span className="pill">Admin</span>}
        {user.current && <span className="pill">Current</span>}
        <button
          className="btn sm danger"
          type="button"
          disabled={busy || user.current}
          onClick={() => {
            if (confirmDelete) {
              setConfirmDelete(false);
              onDelete(userId);
            } else {
              setConfirmDelete(true);
            }
          }}
        >
          <I.Trash size={13} /> {confirmDelete ? "Confirm delete" : "Delete user"}
        </button>
      </div>
    </article>
  );
}

export function UsersScreen() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await pullwiseApi.system.listUsers();
      setUsers(itemsFrom(payload, "users", "items"));
      setError("");
    } catch (err) {
      setUsers([]);
      setError(err?.message || "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const summary = useMemo(
    () => ({
      total: users.length,
      admins: users.filter((user) => user.admin).length,
      repositories: users.reduce((total, user) => total + Number(user.repositoryCount || 0), 0),
      scans: users.reduce((total, user) => total + Number(user.scanCount || 0), 0),
    }),
    [users]
  );

  const deleteUser = async (userId) => {
    setPendingDelete(userId);
    setActionMessage("");
    try {
      await pullwiseApi.system.deleteUser(userId);
      setUsers((current) => current.filter((user) => user.id !== userId));
      setActionMessage("User and related Pullwise records were deleted.");
    } catch (err) {
      setActionMessage(err?.message || "User deletion failed.");
    } finally {
      setPendingDelete("");
    }
  };

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>User Management</h1>
          <p>View authorized sign-in users and remove their Pullwise data.</p>
        </div>
        <div className="page-actions">
          <button className="btn" type="button" onClick={loadUsers} disabled={loading}>
            <I.Refresh size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="auth-error" role="alert">
          <I.X size={14} /> {error}
        </div>
      )}
      {actionMessage && <div className="notice">{actionMessage}</div>}

      <section className="kpis" aria-label="User summary">
        <div className="kpi">
          <strong>{summary.total}</strong>
          <span>Total users</span>
        </div>
        <div className="kpi">
          <strong>{summary.admins}</strong>
          <span>Admins</span>
        </div>
        <div className="kpi">
          <strong>{summary.repositories}</strong>
          <span>Authorized repos</span>
        </div>
        <div className="kpi">
          <strong>{summary.scans}</strong>
          <span>Scans</span>
        </div>
      </section>

      <section className="user-list">
        {loading && users.length === 0 ? (
          <div className="empty">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="empty">No authorized users found.</div>
        ) : (
          users.map((user) => (
            <UserRow key={user.id} user={user} pending={pendingDelete} onDelete={deleteUser} />
          ))
        )}
      </section>
    </main>
  );
}
