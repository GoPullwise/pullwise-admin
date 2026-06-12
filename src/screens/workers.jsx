import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pullwiseApi } from "../api/pullwise.js";
import { I } from "../icons.jsx";

const REFRESH_MS = 15000;
const WORKER_PROVIDER_OPTIONS = [
  { value: "codex", label: "Codex CLI" },
  { value: "opencode", label: "OpenCode CLI" },
];

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

function normalizeWorkerCapacity(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function nextPatchVersion(value) {
  const version = textValue(value).replace(/^v/i, "");
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return "";
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3]) + 1}`;
}

function releaseTag(value) {
  const version = textValue(value).replace(/^v/i, "");
  return version ? `v${version}` : "";
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

function metricNumberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatMetricPercent(value) {
  const number = metricNumberValue(value);
  return number === null ? "Unavailable" : `${number.toFixed(number % 1 === 0 ? 0 : 1)}%`;
}

function formatBytes(value) {
  let number = metricNumberValue(value);
  if (number === null || number < 0) return "Unavailable";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let unit = 0;
  while (number >= 1024 && unit < units.length - 1) {
    number /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || number >= 10 || Number.isInteger(number) ? 0 : 1;
  return `${number.toFixed(digits)} ${units[unit]}`;
}

function formatChartTime(value) {
  const number = metricNumberValue(value);
  if (!number || number <= 0) return "n/a";
  return new Date(number * 1000).toLocaleTimeString(undefined, {
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
    timestampValue(record?.last_activity_at) ||
    timestampValue(record?.completed_at) ||
    timestampValue(record?.started_at) ||
    timestampValue(record?.claimed_at)
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

function metricHistory(metrics) {
  const history = Array.isArray(metrics?.history) ? metrics.history : [];
  if (history.length) return history.filter((point) => point && typeof point === "object");
  if (!metrics) return [];
  return [
    {
      collectedAt: metrics.collectedAt,
      memory: metrics.memory,
      storage: metrics.storage,
    },
  ];
}

function metricSeriesValue(point, metric) {
  if (metric === "memory") return metricNumberValue(point?.memory?.usedPercent);
  if (metric === "storage") return metricNumberValue(point?.storage?.usedPercent);
  return null;
}

function percentAxisDomain(values) {
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = Math.max(2, (maxValue - minValue) * 0.2);
  let min = Math.max(0, minValue - padding);
  let max = Math.min(100, maxValue + padding);
  if (max - min < 1) {
    min = Math.max(0, minValue - 0.5);
    max = Math.min(100, maxValue + 0.5);
  }
  if (max <= min) max = min + 1;
  return { min, max };
}

function MachineMetricChart({ points, metric, color, label }) {
  const samples = points
    .map((point, index) => ({
      index,
      timestamp: metricNumberValue(point?.collectedAt),
      value: metricSeriesValue(point, metric),
    }))
    .filter((sample) => sample.value !== null);

  const width = 360;
  const height = 150;
  const left = 44;
  const right = 10;
  const top = 12;
  const bottom = 30;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  if (samples.length < 2) {
    return <div className="server-machine-chart-empty">Waiting for more samples</div>;
  }

  const times = samples.map((sample) => sample.timestamp ?? sample.index);
  const firstTime = Math.min(...times);
  const lastTime = Math.max(...times);
  const timeRange = lastTime - firstTime || samples.length - 1 || 1;
  const { min, max } = percentAxisDomain(samples.map((sample) => sample.value));
  const valueRange = max - min || 1;
  const yTicks = [max, (max + min) / 2, min];
  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];

  const xForSample = (sample) => {
    if (lastTime === firstTime) return left + (sample.index / (samples.length - 1)) * plotWidth;
    return left + (((sample.timestamp ?? sample.index) - firstTime) / timeRange) * plotWidth;
  };
  const yForValue = (value) => top + ((max - value) / valueRange) * plotHeight;
  const path = samples
    .map((sample, index) => `${index === 0 ? "M" : "L"}${xForSample(sample).toFixed(2)},${yForValue(sample.value).toFixed(2)}`)
    .join(" ");
  const areaPath = `${path} L${xForSample(lastSample).toFixed(2)},${height - bottom} L${xForSample(firstSample).toFixed(
    2
  )},${height - bottom} Z`;

  return (
    <svg
      className="server-machine-chart-svg"
      role="img"
      aria-label={`Worker ${label} over time`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      {yTicks.map((tick) => {
        const y = yForValue(tick);
        return (
          <g key={tick.toFixed(3)}>
            <line className="server-machine-gridline" x1={left} x2={width - right} y1={y} y2={y} />
            <text className="server-machine-axis-label" x={left - 8} y={y + 3} textAnchor="end">
              {formatMetricPercent(tick)}
            </text>
          </g>
        );
      })}
      <line className="server-machine-axis" x1={left} x2={left} y1={top} y2={height - bottom} />
      <line className="server-machine-axis" x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} />
      <path d={areaPath} fill={color} fillOpacity="0.1" />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {samples.map((sample) => (
        <circle key={`${sample.index}-${sample.timestamp ?? "sample"}`} cx={xForSample(sample)} cy={yForValue(sample.value)} r="2.5" fill={color} />
      ))}
      <text className="server-machine-axis-label" x={left} y={height - 8}>
        {formatChartTime(firstSample.timestamp)}
      </text>
      <text className="server-machine-axis-label" x={width - right} y={height - 8} textAnchor="end">
        {formatChartTime(lastSample.timestamp)}
      </text>
    </svg>
  );
}

function MachineMetric({ icon, title, value, detail, points, metric, color }) {
  return (
    <div className="server-machine-metric">
      <div className="server-machine-metric-h">
        <span className="server-machine-metric-icon">{icon}</span>
        <span>{title}</span>
      </div>
      <div className="server-machine-metric-value">{value}</div>
      <div className="server-machine-metric-detail">{detail}</div>
      <div className="server-machine-chart">
        <MachineMetricChart points={points} metric={metric} color={color} label={title} />
      </div>
    </div>
  );
}

function WorkerMachineMetrics({ metrics }) {
  const memory = metrics?.memory || {};
  const storage = metrics?.storage || {};
  const worker = metrics?.worker || {};
  const points = metricHistory(metrics);
  const platform = worker.platform || [worker.system, worker.release].filter(Boolean).join(" ") || "Unavailable";

  return (
    <section className="worker-machine-metrics">
      <h3>Machine metrics</h3>
      {!metrics ? (
        <p className="muted">No machine metrics reported yet.</p>
      ) : (
        <div className="server-machine-monitor">
          <div className="server-machine-facts">
            <div>
              <span>Collected</span>
              <b>{formatTimestamp(metrics.collectedAt)}</b>
            </div>
            <div>
              <span>Platform</span>
              <b>{platform}</b>
            </div>
            <div>
              <span>Machine</span>
              <b>{worker.machine || "Unavailable"}</b>
            </div>
            <div>
              <span>Python</span>
              <b>{worker.pythonVersion || "Unavailable"}</b>
            </div>
          </div>
          <div className="server-machine-grid">
            <MachineMetric
              icon={<I.Activity size={14} />}
              title="RAM Usage"
              value={formatMetricPercent(memory.usedPercent)}
              detail={`${formatBytes(memory.usedBytes)} used / ${formatBytes(memory.totalBytes)} total`}
              points={points}
              metric="memory"
              color="var(--accent)"
            />
            <MachineMetric
              icon={<I.Server size={14} />}
              title="Storage Usage"
              value={formatMetricPercent(storage.usedPercent)}
              detail={`${formatBytes(storage.usedBytes)} used / ${formatBytes(storage.totalBytes)} total`}
              points={points}
              metric="storage"
              color="var(--warn)"
            />
          </div>
        </div>
      )}
    </section>
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

function WorkerReleasePanel({ releaseInfo, releaseVersion, releaseBusy, onReleaseVersionChange, onSubmit }) {
  const latestVersion = textValue(releaseInfo?.latestVersion);
  const suggestedVersion = nextPatchVersion(latestVersion);

  return (
    <section className="worker-release-panel" aria-label="Worker release">
      <div className="worker-release-latest">
        <span>Latest worker release</span>
        <strong>{releaseInfo?.loading ? "Loading..." : latestVersion || "Unavailable"}</strong>
      </div>
      <form className="worker-release-form" onSubmit={onSubmit}>
        <label className="field worker-release-version">
          <span>New release version</span>
          <input
            value={releaseVersion}
            onChange={(event) => onReleaseVersionChange(event.target.value)}
            placeholder={suggestedVersion || "0.4.3"}
          />
        </label>
        <button className="btn primary" type="submit" disabled={releaseBusy}>
          <I.GitBranch size={14} /> Release worker
        </button>
      </form>
    </section>
  );
}

function CreateWorkerModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [version, setVersion] = useState("");
  const [capacity, setCapacity] = useState("1");
  const [providerChain, setProviderChain] = useState(["codex", "opencode"]);
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

  const toggleProvider = (provider) => {
    setProviderChain((current) => {
      if (current.includes(provider)) {
        return current.filter((item) => item !== provider);
      }
      return WORKER_PROVIDER_OPTIONS
        .map((option) => option.value)
        .filter((item) => item === provider || current.includes(item));
    });
  };

  const createWorker = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!providerChain.length) {
      setError("Select at least one agent CLI provider.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const selectedProviders = WORKER_PROVIDER_OPTIONS
        .map((option) => option.value)
        .filter((provider) => providerChain.includes(provider));
      const payload = await pullwiseApi.system.createWorker({
        name: name.trim() || "Worker",
        provider: selectedProviders[0],
        providerChain: selectedProviders,
        provider_chain: selectedProviders,
        region: region.trim(),
        version: version.trim(),
        max_concurrent_jobs: normalizeWorkerCapacity(capacity),
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
                step="1"
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
              />
            </label>
            <fieldset className="field provider-chain-field">
              <legend>Agent CLI providers</legend>
              <div className="provider-toggle-list">
                {WORKER_PROVIDER_OPTIONS.map((option) => (
                  <label className="setting-toggle provider-toggle" key={option.value}>
                    <input
                      type="checkbox"
                      checked={providerChain.includes(option.value)}
                      onChange={() => toggleProvider(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
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

function WorkerDetail({ worker, onWorkerChange }) {
  const [detailWorker, setDetailWorker] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [taskActivity, setTaskActivity] = useState([]);

  useEffect(() => {
    let disposed = false;
    pullwiseApi.system
      .getWorker(worker.worker_id)
      .then((payload) => {
        if (!disposed) {
          const nextWorker = payload?.worker || null;
          setDetailWorker(nextWorker);
          onWorkerChange?.(nextWorker);
          setAuditEvents(Array.isArray(payload?.auditEvents) ? payload.auditEvents : []);
          setTaskActivity(itemsFrom(payload, "taskActivity", "activityEvents", "activity"));
        }
      })
      .catch(() => {
        if (!disposed) {
          setDetailWorker(null);
          onWorkerChange?.(null);
          setAuditEvents([]);
          setTaskActivity([]);
        }
      });
    return () => {
      disposed = true;
    };
  }, [onWorkerChange, worker.worker_id]);

  const displayedWorker = detailWorker ? { ...worker, ...detailWorker } : worker;

  return (
    <div className="worker-detail">
      <section>
        <h3>Health</h3>
        <dl>
          <div>
            <dt>Provider</dt>
            <dd>{displayedWorker.provider || "codex"}</dd>
          </div>
          <div>
            <dt>Last heartbeat</dt>
            <dd>{formatTimestamp(displayedWorker.last_heartbeat_at)}</dd>
          </div>
          <div>
            <dt>Hostname</dt>
            <dd>{displayedWorker.hostname || "-"}</dd>
          </div>
          {displayedWorker.latest_command && (
            <div>
              <dt>Command</dt>
              <dd>
                {commandLabel(displayedWorker.latest_command.command)} · {statusLabel(displayedWorker.latest_command.status)}
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
      <WorkerMachineMetrics metrics={displayedWorker.machineMetrics} />
      <WorkerActivity activity={taskActivity} />
    </div>
  );
}

function WorkerRow({ worker, onAction, pendingAction, rotatedToken }) {
  const [expanded, setExpanded] = useState(false);
  const [detailWorker, setDetailWorker] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editRegion, setEditRegion] = useState(worker.region || "");
  const [editVersion, setEditVersion] = useState(worker.version || "");
  const [editCapacity, setEditCapacity] = useState(String(worker.max_concurrent_jobs || 1));
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const displayedWorker = detailWorker ? { ...worker, ...detailWorker } : worker;

  useEffect(() => {
    setDetailWorker(null);
  }, [worker.worker_id]);

  useEffect(() => {
    if (!editing) {
      setEditRegion(displayedWorker.region || "");
      setEditVersion(displayedWorker.version || "");
      setEditCapacity(String(displayedWorker.max_concurrent_jobs || 1));
    }
  }, [displayedWorker.max_concurrent_jobs, displayedWorker.region, displayedWorker.version, editing]);

  const workerId = displayedWorker.worker_id;
  const isDisabled = displayedWorker.enabled === false;
  const busy = Boolean(pendingAction);
  const running = displayedWorker.running_jobs ?? 0;
  const capacity = displayedWorker.max_concurrent_jobs ?? 1;
  const hasActiveCommand = activeCommand(displayedWorker.latest_command);

  const save = async () => {
    const result = await onAction("save", workerId, {
      region: editRegion,
      version: editVersion,
      max_concurrent_jobs: normalizeWorkerCapacity(editCapacity),
    });
    if (result) setEditing(false);
  };

  return (
    <article className={"worker-row" + (isDisabled ? " is-disabled" : "")}>
      <button className="worker-row-main" type="button" onClick={() => setExpanded((open) => !open)}>
        <span className={`status-dot status-${displayedWorker.status || "unknown"}`} />
        <span className="worker-title">
          <strong>{textValue(displayedWorker.name, displayedWorker.worker_id)}</strong>
          <small>
            {statusLabel(displayedWorker.status)} · {running}/{capacity} jobs · {displayedWorker.region || "No region"}
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
                  step="1"
                  value={editCapacity}
                  onChange={(event) => setEditCapacity(event.target.value)}
                  disabled={!editing}
                />
              </label>
            </div>
          </div>
          <WorkerDetail worker={displayedWorker} onWorkerChange={setDetailWorker} />
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
  const [releaseInfo, setReleaseInfo] = useState({ latestVersion: "", loading: true });
  const [releaseVersion, setReleaseVersion] = useState("");
  const [releaseBusy, setReleaseBusy] = useState(false);
  const latestReleaseRef = useRef("");

  const loadWorkers = useCallback(async (options = {}) => {
    const preserveRotatedTokens = options?.preserveRotatedTokens === true;
    try {
      const payload = await pullwiseApi.system.listWorkers();
      setWorkers(itemsFrom(payload, "workers", "items"));
      setError("");
    } catch (err) {
      setWorkers([]);
      setError(err?.message || "Unable to load workers.");
    } finally {
      if (!preserveRotatedTokens) {
        setRotatedTokens({});
      }
      setLoading(false);
    }
  }, []);

  const loadWorkerDefaults = useCallback(async (options = {}) => {
    setReleaseInfo((current) => ({ ...current, loading: true }));
    try {
      const payload = await pullwiseApi.system.getWorkerDefaults(options?.refresh ? { refresh: "1" } : {});
      const latestVersion = textValue(
        payload?.latestWorkerVersion ||
          payload?.release?.latestVersion ||
          payload?.workerVersion ||
          payload?.version ||
          payload?.defaults?.version
      );
      const previousLatest = latestReleaseRef.current;
      const previousSuggestion = nextPatchVersion(previousLatest);
      const nextSuggestion = nextPatchVersion(latestVersion);
      latestReleaseRef.current = latestVersion;
      setReleaseInfo({ latestVersion, loading: false });
      setReleaseVersion((current) => {
        const normalizedCurrent = textValue(current).replace(/^v/i, "");
        if (!normalizedCurrent || normalizedCurrent === previousSuggestion || normalizedCurrent === previousLatest) {
          return nextSuggestion || current;
        }
        return current;
      });
    } catch {
      setReleaseInfo({ latestVersion: "", loading: false });
    }
  }, []);

  const refreshWorkers = useCallback(() => {
    loadWorkers();
    loadWorkerDefaults({ refresh: true });
  }, [loadWorkerDefaults, loadWorkers]);

  useEffect(() => {
    loadWorkers();
    loadWorkerDefaults();
    const id = setInterval(loadWorkers, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadWorkerDefaults, loadWorkers]);

  const summary = useMemo(() => {
    const active = workers.filter((worker) => worker.enabled !== false && ["idle", "busy"].includes(worker.status)).length;
    return {
      total: workers.length,
      active,
      degraded: workers.filter((worker) => worker.status === "degraded").length,
      disabled: workers.filter((worker) => worker.enabled === false).length,
    };
  }, [workers]);

  const handleReleaseWorker = async (event) => {
    event.preventDefault();
    if (releaseBusy) return;
    const version = textValue(releaseVersion);
    if (!version) {
      setActionMessage("Enter a worker release version.");
      return;
    }
    setReleaseBusy(true);
    setActionMessage("");
    try {
      const result = await pullwiseApi.system.releaseWorker({ version });
      const releasedVersion = textValue(result?.version || version).replace(/^v/i, "");
      const nextVersion = nextPatchVersion(releasedVersion);
      if (nextVersion) {
        setReleaseVersion(nextVersion);
      }
      setActionMessage(`Release workflow queued for ${textValue(result?.tag) || releaseTag(version)}.`);
    } catch (err) {
      setActionMessage(err?.message || "Worker release failed.");
    } finally {
      setReleaseBusy(false);
    }
  };

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
        setActionMessage("Uninstall command queued. Worker removed from registry.");
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
      await loadWorkers({ preserveRotatedTokens: action === "rotate" });
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
          <button className="btn" type="button" onClick={refreshWorkers} disabled={loading}>
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

      <WorkerReleasePanel
        releaseInfo={releaseInfo}
        releaseVersion={releaseVersion}
        releaseBusy={releaseBusy}
        onReleaseVersionChange={setReleaseVersion}
        onSubmit={handleReleaseWorker}
      />

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
