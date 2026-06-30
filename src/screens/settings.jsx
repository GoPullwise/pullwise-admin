/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pullwiseApi } from "../api/pullwise.js";
import { I } from "../icons.jsx";

const PLAN_SETTING_GROUP_IDS = new Set(["plans", "billing"]);
const RESTART_CONFIRM_TIMEOUT_MS = 10000;

const SUGGESTED_DEFAULTS = {
  "billing.creemProProductIds": "prod_pro_monthly, prod_pro_yearly",
  "billing.creemMaxProductIds": "prod_max_monthly, prod_max_yearly",
  "billing.creemApiBaseUrl": "https://api.creem.io",
};

export function isPlanSettingGroup(group) {
  return PLAN_SETTING_GROUP_IDS.has(String(group?.id || "").toLowerCase());
}

export function cloneSettings(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

export function valueAt(settings, path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => (current && typeof current === "object" ? current[key] : undefined), settings);
}

export function setValueAt(settings, path, value) {
  const next = cloneSettings(settings);
  const segments = String(path || "").split(".").filter(Boolean);
  let current = next;
  for (const segment of segments.slice(0, -1)) {
    if (!current[segment] || typeof current[segment] !== "object" || Array.isArray(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[segments[segments.length - 1]] = value;
  return next;
}

export function textValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  return value ?? "";
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatPercent(value) {
  const number = numberValue(value);
  return number === null ? "Unavailable" : `${number.toFixed(number % 1 === 0 ? 0 : 1)}%`;
}

function formatBytes(value) {
  let number = numberValue(value);
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

function formatTimestamp(value) {
  const number = numberValue(value);
  if (!number || number <= 0) return "Unknown";
  return new Date(number * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatChartTime(value) {
  const number = numberValue(value);
  if (!number || number <= 0) return "n/a";
  return new Date(number * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
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
  if (metric === "memory") return numberValue(point?.memory?.usedPercent);
  if (metric === "storage") return numberValue(point?.storage?.usedPercent);
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

function ServerMetricChart({ points, metric, color, label }) {
  const samples = points
    .map((point, index) => ({
      index,
      timestamp: numberValue(point?.collectedAt),
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
      aria-label={`${label} over time`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      {yTicks.map((tick) => {
        const y = yForValue(tick);
        return (
          <g key={tick.toFixed(3)}>
            <line className="server-machine-gridline" x1={left} x2={width - right} y1={y} y2={y} />
            <text className="server-machine-axis-label" x={left - 8} y={y + 3} textAnchor="end">
              {formatPercent(tick)}
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

function ServerFact({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value || "Unavailable"}</b>
    </div>
  );
}

function ServerMachineMetric({ icon, title, value, detail, points, metric, color }) {
  return (
    <div className="server-machine-metric">
      <div className="server-machine-metric-h">
        <span className="server-machine-metric-icon">{icon}</span>
        <span>{title}</span>
      </div>
      <div className="server-machine-metric-value">{value}</div>
      <div className="server-machine-metric-detail">{detail}</div>
      <div className="server-machine-chart">
        <ServerMetricChart points={points} metric={metric} color={color} label={title} />
      </div>
    </div>
  );
}

function ServerMetricsPanel({ metrics, loading, error }) {
  const memory = metrics?.memory || {};
  const storage = metrics?.storage || {};
  const server = metrics?.server || {};
  const points = metricHistory(metrics);
  const hostname = server.hostname || "Unknown host";
  const platform = server.platform || [server.system, server.release].filter(Boolean).join(" ") || "Unavailable";
  const machine = server.machine || "Unavailable";
  const platformText = [platform, machine === "Unavailable" ? "" : machine].filter(Boolean).join(" ");

  return (
    <section className="settings-section server-overview">
      <div className="settings-section-head">
        <h2>Server Machine</h2>
        <p>{platformText || "Runtime host metrics"}</p>
      </div>
      {error ? (
        <div className="auth-error" role="alert">
          <I.X size={14} /> {error}
        </div>
      ) : null}
      {loading && !metrics ? (
        <div className="empty">Loading server metrics...</div>
      ) : !metrics && error ? null : !metrics ? (
        <div className="empty">No server metrics collected yet.</div>
      ) : (
        <div className="server-machine-monitor">
          <div className="server-machine-facts">
            <ServerFact label="Host" value={hostname} />
            <ServerFact label="Platform" value={platform} />
            <ServerFact label="Machine" value={machine} />
            <ServerFact label="Collected" value={formatTimestamp(metrics?.collectedAt)} />
          </div>
          <div className="server-machine-grid">
            <ServerMachineMetric
              icon={<I.Activity size={14} />}
              title="RAM Usage"
              value={formatPercent(memory.usedPercent)}
              detail={`${formatBytes(memory.usedBytes)} used / ${formatBytes(memory.totalBytes)} total`}
              points={points}
              metric="memory"
              color="var(--accent)"
            />
            <ServerMachineMetric
              icon={<I.Server size={14} />}
              title="Storage Usage"
              value={formatPercent(storage.usedPercent)}
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

export function recommendedValueForField(field, defaults) {
  const configured = valueAt(defaults, field.path);
  if (configured !== undefined && configured !== null && textValue(configured) !== "") return textValue(configured);
  return SUGGESTED_DEFAULTS[field.path] || "";
}

export function parseFieldValue(field, value) {
  if (field.type === "boolean") return Boolean(value);
  if (field.type === "password") return String(value || "");
  if (field.type === "integer") {
    if (value === "") return "";
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : "";
  }
  if (field.type === "number") {
    if (value === "") return "";
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : "";
  }
  if (field.type === "stringList") {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}

export function SettingField({ field, value, defaults, secret, onChange }) {
  const id = `setting-${field.path.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const update = (nextValue) => onChange(field.path, parseFieldValue(field, nextValue));
  const isPassword = field.type === "password";
  const savedSecret = isPassword && secret?.hasValue === true;
  const suggestion = !isPassword && textValue(value) === "" ? recommendedValueForField(field, defaults) : "";
  const enabled = value === true;
  return (
    <label className="setting-field" htmlFor={id}>
      <span className="setting-label">{field.label || field.path}</span>
      {field.type === "boolean" ? (
        <span className="setting-toggle">
          <input
            id={id}
            type="checkbox"
            checked={enabled}
            onChange={(event) => update(event.target.checked)}
          />
          <span>{enabled ? "Enabled" : "Disabled"}</span>
        </span>
      ) : field.type === "select" ? (
        <select id={id} value={textValue(value)} onChange={(event) => update(event.target.value)}>
          {(Array.isArray(field.options) ? field.options : []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={field.type === "integer" || field.type === "number" ? "number" : isPassword ? "password" : "text"}
          min={field.min ?? undefined}
          value={textValue(value)}
          placeholder={savedSecret ? "Saved password configured" : undefined}
          autoComplete={isPassword ? "new-password" : undefined}
          onChange={(event) => update(event.target.value)}
        />
      )}
      <small>
        {field.description}
        {suggestion ? <span className="setting-suggestion"> Suggested: {suggestion}</span> : null}
        {savedSecret ? <span className="setting-suggestion"> Saved password configured; leave blank to keep it.</span> : null}
      </small>
    </label>
  );
}

export function SettingsScreen() {
  const [payload, setPayload] = useState(null);
  const [serverMetrics, setServerMetrics] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [error, setError] = useState("");
  const [metricsError, setMetricsError] = useState("");
  const [message, setMessage] = useState("");
  const restartConfirmTimerRef = useRef(null);

  const clearRestartConfirmTimer = useCallback(() => {
    if (restartConfirmTimerRef.current) {
      window.clearTimeout(restartConfirmTimerRef.current);
      restartConfirmTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearRestartConfirmTimer, [clearRestartConfirmTimer]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    setMetricsError("");
    try {
      const [configResult, metricsResult] = await Promise.allSettled([
        pullwiseApi.system.getSystemConfig(),
        pullwiseApi.system.getServerMetrics(),
      ]);

      if (configResult.status === "fulfilled") {
        const nextPayload = configResult.value;
        setPayload(nextPayload);
        setSettings(cloneSettings(nextPayload?.settings));
      } else {
        setError(configResult.reason?.message || "Unable to load system config.");
        setPayload(null);
        setSettings({});
      }

      if (metricsResult.status === "fulfilled") {
        setServerMetrics(metricsResult.value);
      } else {
        setServerMetrics(null);
        setMetricsError(metricsResult.reason?.message || "Unable to load server metrics.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const groups = useMemo(
    () => (Array.isArray(payload?.groups) ? payload.groups.filter((group) => !isPlanSettingGroup(group)) : []),
    [payload]
  );

  const updateField = (path, value) => {
    setSettings((current) => setValueAt(current, path, value));
  };

  const saveSettings = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const nextPayload = await pullwiseApi.system.updateSystemConfig({ settings });
      setPayload(nextPayload);
      setSettings(cloneSettings(nextPayload?.settings));
      setMessage("System config saved.");
    } catch (err) {
      setError(err?.message || "Unable to save system config.");
    } finally {
      setSaving(false);
    }
  };

  const restartServer = async () => {
    if (!restartConfirm) {
      clearRestartConfirmTimer();
      setRestartConfirm(true);
      setError("");
      setMessage("");
      restartConfirmTimerRef.current = window.setTimeout(() => {
        setRestartConfirm(false);
        restartConfirmTimerRef.current = null;
      }, RESTART_CONFIRM_TIMEOUT_MS);
      return;
    }
    clearRestartConfirmTimer();
    setRestartConfirm(false);
    setRestarting(true);
    setError("");
    setMessage("");
    try {
      const result = await pullwiseApi.system.restartServer();
      setMessage(result?.message || "Pullwise server restart started.");
      setRestartConfirm(false);
    } catch (err) {
      setError(err?.message || "Unable to restart Pullwise server.");
    } finally {
      setRestarting(false);
    }
  };

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>System Settings</h1>
          <p>Database-backed server settings for scan scheduling, worker claims, rate limits, alerts, and calibration.</p>
        </div>
        <div className="page-actions">
          <button className="btn" type="button" onClick={loadSettings} disabled={loading || saving || restarting}>
            <I.Refresh size={14} className={loading ? "spin" : ""} /> Refresh
          </button>
          <button className="btn danger" type="button" onClick={restartServer} disabled={loading || saving || restarting}>
            {restarting ? <I.Refresh size={14} className="spin" /> : <I.Power size={14} />}
            {restartConfirm ? "Confirm restart" : "Restart server"}
          </button>
          <button className="btn primary" type="button" onClick={saveSettings} disabled={loading || saving || restarting}>
            {saving ? <I.Refresh size={14} className="spin" /> : <I.Save size={14} />}
            Save
          </button>
        </div>
      </div>

      {error && (
        <div className="auth-error" role="alert">
          <I.X size={14} /> {error}
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          <I.Check size={14} /> {message}
        </div>
      )}

      <ServerMetricsPanel metrics={serverMetrics} loading={loading} error={metricsError} />

      {loading && <div className="empty">Loading system config...</div>}
      {!loading && !error && groups.length === 0 && <div className="empty">No system config metadata returned.</div>}
      {!loading && groups.length > 0 && (
        <div className="settings-list">
          {groups.map((group) => (
            <section className="settings-section" key={group.id || group.title}>
              <div className="settings-section-head">
                <h2>{group.title}</h2>
                <p>{group.description}</p>
              </div>
              <div className="settings-grid">
                {(Array.isArray(group.fields) ? group.fields : []).map((field) => (
                  <SettingField
                    key={field.path}
                    field={field}
                    value={valueAt(settings, field.path)}
                    defaults={payload?.defaults}
                    secret={payload?.secrets?.[field.path]}
                    onChange={updateField}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
