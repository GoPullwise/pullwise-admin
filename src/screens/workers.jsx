import { useCallback, useEffect, useMemo, useState } from "react";
import { pullwiseApi } from "../api/pullwise.js";
import { I } from "../icons.jsx";

const REFRESH_MS = 15000;

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

function statusLabel(status) {
  return textValue(status, "unknown").replace(/^\w/, (char) => char.toUpperCase());
}

function commandLabel(command) {
  const value = textValue(command, "command");
  if (value === "uninstall") return "Uninstall service";
  if (value === "stop") return "Stop service";
  return statusLabel(value);
}

function activeCommand(command) {
  return ["pending", "running"].includes(textValue(command?.status).toLowerCase());
}

function timestampValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function timestampDate(value) {
  const seconds = timestampValue(value);
  return seconds ? new Date(seconds * 1000) : null;
}

function formatTimestamp(value) {
  const date = timestampDate(value);
  if (!date) return "Never";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timestampDateTime(value) {
  const date = timestampDate(value);
  return date ? date.toISOString() : undefined;
}

function sameLocalDay(value, reference = new Date()) {
  const date = timestampDate(value);
  if (!date) return false;
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

function activityTime(record) {
  return (
    timestampValue(record?.completed_at) ||
    timestampValue(record?.started_at) ||
    timestampValue(record?.claimed_at) ||
    timestampValue(record?.last_activity_at)
  );
}

function installCommands(result) {
  const commands = [];
  const standard = result?.install_commands?.standard || result?.install_command || "";
  const local = result?.install_commands?.local || result?.local_install_command || "";
  if (standard) commands.push({ key: "standard", title: "Standard deployment", value: standard });
  if (local && local !== standard) commands.push({ key: "local", title: "Local same-host deployment", value: local });
  return commands;
}

function tokenFromResult(result) {
  return (
    result?.worker_token ||
    result?.worker?.worker_token ||
    result?.suggested_env?.PULLWISE_WORKER_TOKEN ||
    result?.token ||
    ""
  );
}

function WorkerActivity({ activity }) {
  const todayCount = useMemo(
    () => activity.filter((record) => sameLocalDay(activityTime(record))).length,
    [activity]
  );

  return (
    <section className="worker-activity">
      <div className="activity-head">
        <h3>Task activity</h3>
        <div className="activity-summary">
          <strong>{todayCount}</strong>
          <span>{todayCount === 1 ? "task today" : "tasks today"}</span>
        </div>
      </div>
      {activity.length ? (
        <ul className="activity-list">
          {activity.map((record) => (
            <li key={`${record.job_id}-${record.attempt || 0}`}>
              <div className="activity-record-head">
                <strong>{textValue(record.repo, record.scan_id || record.job_id)}</strong>
                <span>{statusLabel(record.status)}</span>
              </div>
              <div className="activity-meta">
                {textValue(record.branch, "main")} - attempt {record.attempt || 0}
              </div>
              <div className="activity-times">
                {record.claimed_at && (
                  <time dateTime={timestampDateTime(record.claimed_at)}>
                    Claimed {formatTimestamp(record.claimed_at)}
                  </time>
                )}
                {record.started_at && (
                  <time dateTime={timestampDateTime(record.started_at)}>
                    Started {formatTimestamp(record.started_at)}
                  </time>
                )}
                {record.completed_at && (
                  <time dateTime={timestampDateTime(record.completed_at)}>
                    Completed {formatTimestamp(record.completed_at)}
                  </time>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No task activity recorded.</p>
      )}
    </section>
  );
}

function ResultBlock({ result }) {
  const commands = installCommands(result);
  const token = tokenFromResult(result);
  const [copied, setCopied] = useState("");

  const copy = async (key, value) => {
    if (!value || !navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    setCopied(key);
  };

  if (!commands.length && !token) return null;

  return (
    <div className="result-block">
      {commands.map((command) => (
        <div className="code-block" key={command.key}>
          <div className="code-head">
            <strong>{command.title}</strong>
            <button className="btn ghost sm" type="button" onClick={() => copy(command.key, command.value)}>
              <I.Clipboard size={13} /> {copied === command.key ? "Copied" : "Copy"}
            </button>
          </div>
          <pre>{command.value}</pre>
        </div>
      ))}
      {token && (
        <div className="code-block">
          <div className="code-head">
            <strong>Worker token</strong>
          </div>
          <pre>{token}</pre>
        </div>
      )}
    </div>
  );
}

function WorkerTokenBlock({ token }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!token || !navigator.clipboard) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
  };

  if (!token) return null;

  return (
    <div className="result-block worker-token-result">
      <div className="code-block">
        <div className="code-head">
          <strong>Rotated worker token</strong>
          <button className="btn ghost sm" type="button" onClick={copy}>
            <I.Clipboard size={13} /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre>{token}</pre>
      </div>
    </div>
  );
}

function CreateWorkerModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [version, setVersion] = useState("");
  const [capacity, setCapacity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    let disposed = false;
    pullwiseApi.system
      .getWorkerDefaults()
      .then((payload) => {
        const defaultVersion = textValue(
          payload?.workerVersion || payload?.version || payload?.defaults?.version
        );
        if (!disposed && defaultVersion) {
          setVersion((current) => current || defaultVersion);
        }
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, []);

  const createWorker = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const payload = await pullwiseApi.system.createWorker({
        name: name.trim() || "Worker",
        provider: "codex",
        region: region.trim(),
        version: version.trim(),
        max_concurrent_jobs: Number(capacity) || 1,
      });
      setResult(payload);
      onCreated?.();
    } catch (err) {
      setError(err?.message || "Worker creation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>Register new worker</h2>
          <button className="btn ghost sm" type="button" onClick={onClose} aria-label="Close">
            <I.X size={16} />
          </button>
        </div>
        <form onSubmit={createWorker}>
          <div className="form-grid">
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="US-East Worker" />
            </label>
            <label className="field">
              <span>Region</span>
              <input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="us-east" />
            </label>
            <label className="field">
              <span>Version</span>
              <input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="0.1.0" />
            </label>
            <label className="field">
              <span>Max concurrent jobs</span>
              <input
                type="number"
                min="1"
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
              />
            </label>
          </div>
          {error && (
            <div className="auth-error" role="alert">
              <I.X size={14} /> {error}
            </div>
          )}
          {result && <ResultBlock result={result} />}
          <div className="modal-foot">
            <button className="btn ghost" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" type="submit" disabled={busy}>
              <I.Plus size={14} /> Create worker
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WorkerDetail({ worker }) {
  const [auditEvents, setAuditEvents] = useState([]);
  const [taskActivity, setTaskActivity] = useState([]);

  useEffect(() => {
    let disposed = false;
    pullwiseApi.system
      .getWorker(worker.worker_id)
      .then((payload) => {
        if (!disposed) {
          setAuditEvents(Array.isArray(payload?.auditEvents) ? payload.auditEvents : []);
          setTaskActivity(itemsFrom(payload, "taskActivity", "activityEvents", "activity"));
        }
      })
      .catch(() => {
        if (!disposed) {
          setAuditEvents([]);
          setTaskActivity([]);
        }
      });
    return () => {
      disposed = true;
    };
  }, [worker.worker_id]);

  return (
    <div className="worker-detail">
      <section>
        <h3>Health</h3>
        <dl>
          <div>
            <dt>Provider</dt>
            <dd>{worker.provider || "codex"}</dd>
          </div>
          <div>
            <dt>Last heartbeat</dt>
            <dd>{worker.last_heartbeat_at || "Never"}</dd>
          </div>
          <div>
            <dt>Hostname</dt>
            <dd>{worker.hostname || "-"}</dd>
          </div>
          {worker.latest_command && (
            <div>
              <dt>Command</dt>
              <dd>
                {commandLabel(worker.latest_command.command)} · {statusLabel(worker.latest_command.status)}
              </dd>
            </div>
          )}
        </dl>
      </section>
      <section>
        <h3>Audit log</h3>
        {auditEvents.length ? (
          <ul className="audit-list">
            {auditEvents.map((event, index) => (
              <li key={`${event.action}-${index}`}>{event.action}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No audit events.</p>
        )}
      </section>
      <WorkerActivity activity={taskActivity} />
    </div>
  );
}

function WorkerRow({ worker, onAction, pendingAction, rotatedToken }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editRegion, setEditRegion] = useState(worker.region || "");
  const [editVersion, setEditVersion] = useState(worker.version || "");
  const [editCapacity, setEditCapacity] = useState(String(worker.max_concurrent_jobs || 1));
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!editing) {
      setEditRegion(worker.region || "");
      setEditVersion(worker.version || "");
      setEditCapacity(String(worker.max_concurrent_jobs || 1));
    }
  }, [editing, worker.max_concurrent_jobs, worker.region, worker.version]);

  const workerId = worker.worker_id;
  const isDisabled = worker.enabled === false;
  const busy = Boolean(pendingAction);
  const running = worker.running_jobs ?? 0;
  const capacity = worker.max_concurrent_jobs ?? 1;
  const hasActiveCommand = activeCommand(worker.latest_command);

  const save = () => {
    onAction("save", workerId, {
      region: editRegion,
      version: editVersion,
      max_concurrent_jobs: Number(editCapacity) || 1,
    });
    setEditing(false);
  };

  return (
    <article className={"worker-row" + (isDisabled ? " is-disabled" : "")}>
      <button className="worker-row-main" type="button" onClick={() => setExpanded((open) => !open)}>
        <span className={`status-dot status-${worker.status || "unknown"}`} />
        <span className="worker-title">
          <strong>{textValue(worker.name, worker.worker_id)}</strong>
          <small>
            {statusLabel(worker.status)} · {running}/{capacity} jobs · {worker.region || "No region"}
          </small>
        </span>
        <I.ChevD size={16} className={expanded ? "rotate" : ""} />
      </button>
      {expanded && (
        <div className="worker-expanded">
          <div className="worker-actions">
            {isDisabled ? (
              <button className="btn sm" type="button" disabled={busy || hasActiveCommand} onClick={() => onAction("enable", workerId)}>
                Enable
              </button>
            ) : (
              <button className="btn sm" type="button" disabled={busy || hasActiveCommand} onClick={() => onAction("disable", workerId)}>
                Stop new jobs
              </button>
            )}
            <button className="btn sm" type="button" disabled={busy} onClick={() => onAction("test", workerId)}>
              Health check
            </button>
            <button className="btn sm" type="button" disabled={busy || hasActiveCommand} onClick={() => onAction("rotate", workerId)}>
              Rotate token
            </button>
            <button className="btn sm" type="button" disabled={busy || hasActiveCommand} onClick={() => {
              if (confirmStop) {
                setConfirmStop(false);
                onAction("stop-service", workerId);
              } else {
                setConfirmStop(true);
                setConfirmDelete(false);
                setConfirmRemove(false);
              }
            }}>
              <I.Power size={13} /> {confirmStop ? "Confirm stop" : "Stop service"}
            </button>
            <button className="btn sm danger" type="button" disabled={busy || hasActiveCommand} onClick={() => {
              if (confirmDelete) {
                setConfirmDelete(false);
                onAction("delete-service", workerId);
              } else {
                setConfirmDelete(true);
                setConfirmStop(false);
                setConfirmRemove(false);
              }
            }}>
              <I.Trash size={13} /> {confirmDelete ? "Confirm uninstall" : "Uninstall service"}
            </button>
            <button className="btn sm danger" type="button" disabled={busy} onClick={() => {
              if (confirmRemove) {
                setConfirmRemove(false);
                onAction("delete", workerId);
              } else {
                setConfirmRemove(true);
                setConfirmStop(false);
                setConfirmDelete(false);
              }
            }}>
              <I.Trash size={13} /> {confirmRemove ? "Confirm remove" : "Remove worker"}
            </button>
          </div>
          <WorkerTokenBlock token={rotatedToken} />
          <div className="edit-panel">
            <div className="edit-head">
              <h3>Configuration</h3>
              {editing ? (
                <div className="inline-actions">
                  <button className="btn ghost sm" type="button" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                  <button className="btn primary sm" type="button" disabled={busy} onClick={save}>
                    Save
                  </button>
                </div>
              ) : (
                <button className="btn ghost sm" type="button" onClick={() => setEditing(true)}>
                  Edit
                </button>
              )}
            </div>
            <div className="form-grid compact">
              <label className="field">
                <span>Region</span>
                <input value={editRegion} onChange={(event) => setEditRegion(event.target.value)} disabled={!editing} />
              </label>
              <label className="field">
                <span>Version</span>
                <input value={editVersion} onChange={(event) => setEditVersion(event.target.value)} disabled={!editing} />
              </label>
              <label className="field">
                <span>Max concurrent jobs</span>
                <input
                  type="number"
                  min="1"
                  value={editCapacity}
                  onChange={(event) => setEditCapacity(event.target.value)}
                  disabled={!editing}
                />
              </label>
            </div>
          </div>
          <WorkerDetail worker={worker} />
        </div>
      )}
    </article>
  );
}

export function WorkersScreen() {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [rotatedTokens, setRotatedTokens] = useState({});

  const loadWorkers = useCallback(async () => {
    try {
      const payload = await pullwiseApi.system.listWorkers();
      setWorkers(itemsFrom(payload, "workers", "items"));
      setError("");
    } catch (err) {
      setWorkers([]);
      setError(err?.message || "Unable to load workers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkers();
    const id = setInterval(loadWorkers, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadWorkers]);

  const summary = useMemo(() => {
    const active = workers.filter((worker) => worker.enabled !== false && ["idle", "busy"].includes(worker.status)).length;
    return {
      total: workers.length,
      active,
      degraded: workers.filter((worker) => worker.status === "degraded").length,
      disabled: workers.filter((worker) => worker.enabled === false).length,
    };
  }, [workers]);

  const handleAction = async (action, workerId, payload = {}) => {
    const actionKey = `${action}:${workerId}`;
    setPendingAction(actionKey);
    setActionMessage("");
    try {
      let result;
      if (action === "save") {
        result = await pullwiseApi.system.updateWorker(workerId, payload);
        setActionMessage("Worker updated.");
      } else if (action === "enable") {
        result = await pullwiseApi.system.enableWorker(workerId);
        setActionMessage("Worker enabled.");
      } else if (action === "disable") {
        result = await pullwiseApi.system.disableWorker(workerId);
        setActionMessage("Worker disabled. Running jobs continue.");
      } else if (action === "test") {
        result = await pullwiseApi.system.testWorker(workerId);
        setActionMessage(result?.result?.ok ? "Health check passed." : "Health check needs attention.");
      } else if (action === "rotate") {
        result = await pullwiseApi.system.rotateWorkerToken(workerId);
        setRotatedTokens((current) => ({
          ...current,
          [workerId]: tokenFromResult(result),
        }));
        setActionMessage("Worker token rotated.");
      } else if (action === "stop-service") {
        result = await pullwiseApi.system.commandWorker(workerId, "stop");
        setActionMessage("Stop command queued. Running jobs finish first.");
      } else if (action === "delete-service") {
        result = await pullwiseApi.system.commandWorker(workerId, "uninstall");
        setActionMessage("Uninstall command queued. The worker cannot be restarted from admin.");
      } else if (action === "delete") {
        result = await pullwiseApi.system.deleteWorker(workerId);
        setWorkers((current) => current.filter((worker) => worker.worker_id !== workerId));
        setRotatedTokens((current) => {
          const next = { ...current };
          delete next[workerId];
          return next;
        });
        setActionMessage("Worker removed from registry.");
        return result;
      }
      await loadWorkers();
      return result;
    } catch (err) {
      setActionMessage(err?.message || "Action failed.");
      return null;
    } finally {
      setPendingAction("");
    }
  };

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Worker Registry</h1>
          <p>Register, configure, and monitor Pullwise scan workers.</p>
        </div>
        <div className="page-actions">
          <button className="btn" type="button" onClick={loadWorkers} disabled={loading}>
            <I.Refresh size={14} /> Refresh
          </button>
          <button className="btn primary" type="button" onClick={() => setShowCreate(true)}>
            <I.Plus size={14} /> Register worker
          </button>
        </div>
      </div>

      {error && (
        <div className="auth-error" role="alert">
          <I.X size={14} /> {error}
        </div>
      )}
      {actionMessage && <div className="notice">{actionMessage}</div>}

      <section className="kpis" aria-label="Worker summary">
        <div className="kpi">
          <strong>{summary.total}</strong>
          <span>Total workers</span>
        </div>
        <div className="kpi">
          <strong>{summary.active}</strong>
          <span>Active</span>
        </div>
        <div className="kpi">
          <strong>{summary.degraded}</strong>
          <span>Degraded</span>
        </div>
        <div className="kpi">
          <strong>{summary.disabled}</strong>
          <span>Disabled</span>
        </div>
      </section>

      <section className="worker-list">
        {loading && workers.length === 0 ? (
          <div className="empty">Loading workers...</div>
        ) : workers.length === 0 ? (
          <div className="empty">No workers registered yet.</div>
        ) : (
          workers.map((worker) => (
            <WorkerRow
              key={worker.worker_id || worker.name}
              worker={worker}
              onAction={handleAction}
              pendingAction={pendingAction}
              rotatedToken={rotatedTokens[worker.worker_id]}
            />
          ))
        )}
      </section>

      {showCreate && <CreateWorkerModal onClose={() => setShowCreate(false)} onCreated={loadWorkers} />}
    </main>
  );
}
