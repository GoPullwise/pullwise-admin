/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useMemo, useState } from "react";
import { pullwiseApi } from "../api/pullwise.js";
import { I } from "../icons.jsx";

const PLAN_SETTING_GROUP_IDS = new Set(["plans", "billing"]);

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

function loadAverageText(cpu) {
  const load = cpu?.loadAverage;
  const oneMinute = numberValue(load?.oneMinute);
  if (oneMinute === null) return "";
  return `load ${oneMinute.toFixed(2)}`;
}

function cpuDetail(cpu) {
  const parts = [];
  const logicalCount = numberValue(cpu?.logicalCount);
  if (logicalCount) parts.push(`${logicalCount} logical cores`);
  const load = loadAverageText(cpu);
  if (load) parts.push(load);
  return parts.join(" - ");
}

function capacityDetail(totalBytes, usedPercent) {
  const parts = [];
  const total = formatBytes(totalBytes);
  const used = formatPercent(usedPercent);
  if (total !== "Unavailable") parts.push(`${total} total`);
  if (used !== "Unavailable") parts.push(`${used} used`);
  return parts.join(" - ");
}

function ServerMetric({ icon, label, value, detail }) {
  return (
    <div className="server-metric">
      <span className="server-metric-label">
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function ServerMetricsPanel({ metrics, loading, error }) {
  const cpu = metrics?.cpu || {};
  const memory = metrics?.memory || {};
  const storage = metrics?.storage || {};
  const server = metrics?.server || {};
  const hostname = server.hostname || "Unknown host";
  const platformText = [server.system, server.release, server.machine].filter(Boolean).join(" ");

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
      ) : (
        <div className="server-metrics">
          <ServerMetric
            icon={<I.Activity size={14} />}
            label="CPU usage"
            value={formatPercent(cpu.usagePercent)}
            detail={cpuDetail(cpu)}
          />
          <ServerMetric
            icon={<I.Server size={14} />}
            label="RAM available"
            value={formatBytes(memory.availableBytes)}
            detail={capacityDetail(memory.totalBytes, memory.usedPercent)}
          />
          <ServerMetric
            icon={<I.Server size={14} />}
            label="Storage available"
            value={formatBytes(storage.freeBytes)}
            detail={capacityDetail(storage.totalBytes, storage.usedPercent)}
          />
          <ServerMetric
            icon={<I.Shield size={14} />}
            label="Host"
            value={hostname}
            detail={`Collected ${formatTimestamp(metrics?.collectedAt)}`}
          />
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
  if (field.type === "integer") return value === "" ? "" : Number.parseInt(value, 10);
  if (field.type === "number") return value === "" ? "" : Number.parseFloat(value);
  if (field.type === "stringList") {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}

export function SettingField({ field, value, defaults, onChange }) {
  const id = `setting-${field.path.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  const update = (nextValue) => onChange(field.path, parseFieldValue(field, nextValue));
  const suggestion = textValue(value) === "" ? recommendedValueForField(field, defaults) : "";
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
          type={field.type === "integer" || field.type === "number" ? "number" : "text"}
          min={field.min ?? undefined}
          value={textValue(value)}
          onChange={(event) => update(event.target.value)}
        />
      )}
      <small>
        {field.description}
        {suggestion ? <span className="setting-suggestion"> Suggested: {suggestion}</span> : null}
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
  const [error, setError] = useState("");
  const [metricsError, setMetricsError] = useState("");
  const [message, setMessage] = useState("");

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

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>System Settings</h1>
          <p>Database-backed server settings for scan scheduling, worker claims, rate limits, and calibration.</p>
        </div>
        <div className="page-actions">
          <button className="btn" type="button" onClick={loadSettings} disabled={loading || saving}>
            <I.Refresh size={14} className={loading ? "spin" : ""} /> Refresh
          </button>
          <button className="btn primary" type="button" onClick={saveSettings} disabled={loading || saving}>
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
      {!loading && groups.length === 0 && <div className="empty">No system config metadata returned.</div>}
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
