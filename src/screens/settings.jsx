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
  return (
    <label className="setting-field" htmlFor={id}>
      <span className="setting-label">{field.label || field.path}</span>
      {field.type === "boolean" ? (
        <span className="setting-toggle">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => update(event.target.checked)}
          />
          <span>{Boolean(value) ? "Enabled" : "Disabled"}</span>
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
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextPayload = await pullwiseApi.system.getSystemConfig();
      setPayload(nextPayload);
      setSettings(cloneSettings(nextPayload?.settings));
    } catch (err) {
      setError(err?.message || "Unable to load system config.");
      setPayload(null);
      setSettings({});
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
