import { useCallback, useEffect, useMemo, useState } from "react";
import { pullwiseApi } from "../api/pullwise.js";
import { I } from "../icons.jsx";
import { cloneSettings, isPlanSettingGroup, SettingField, setValueAt, valueAt } from "./settings.jsx";

function planSettingGroups(payload) {
  return Array.isArray(payload?.groups) ? payload.groups.filter(isPlanSettingGroup) : [];
}

export function PlansScreen() {
  const [systemPayload, setSystemPayload] = useState(null);
  const [planSettings, setPlanSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingPlanSettings, setSavingPlanSettings] = useState(false);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextSystemPayload = await pullwiseApi.system.getSystemConfig();
      setSystemPayload(nextSystemPayload);
      setPlanSettings(cloneSettings(nextSystemPayload?.settings));
    } catch (err) {
      setError(err?.message || "Unable to load plan settings.");
      setSystemPayload(null);
      setPlanSettings({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const groups = useMemo(() => planSettingGroups(systemPayload), [systemPayload]);

  const updatePlanSetting = (path, value) => {
    setPlanSettings((current) => setValueAt(current, path, value));
  };

  const savePlanSettings = async () => {
    setSavingPlanSettings(true);
    setError("");
    setMessage("");
    try {
      const nextPayload = await pullwiseApi.system.updateSystemConfig({ settings: planSettings });
      setSystemPayload(nextPayload);
      setPlanSettings(cloneSettings(nextPayload?.settings));
      setMessage("Plan settings saved.");
    } catch (err) {
      setError(err?.message || "Unable to save plan settings.");
    } finally {
      setSavingPlanSettings(false);
    }
  };

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Plans</h1>
          <p>Plan quotas, billing catalog, and review agent policy for Free, Pro, and Max scan jobs.</p>
        </div>
        <div className="page-actions">
          <button className="btn" type="button" onClick={loadPlans} disabled={loading}>
            <I.Refresh size={14} className={loading ? "spin" : ""} /> Refresh
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

      {loading && <div className="empty">Loading plan settings...</div>}
      {!loading && groups.length > 0 && (
        <section className="plan-settings-panel">
          <div className="plan-settings-head">
            <div>
              <h2>Plan Settings</h2>
              <p>Quota and billing fields live here because they change how plans behave and are sold.</p>
            </div>
            <button
              className="btn primary"
              type="button"
              onClick={savePlanSettings}
              disabled={savingPlanSettings || loading}
            >
              {savingPlanSettings ? <I.Refresh size={14} className="spin" /> : <I.Save size={14} />}
              Save Plan Settings
            </button>
          </div>
          <div className="plan-settings-sections">
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
                      value={valueAt(planSettings, field.path)}
                      defaults={systemPayload?.defaults}
                      onChange={updatePlanSetting}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}
      {!loading && groups.length === 0 && <div className="empty">No plan settings returned.</div>}
    </main>
  );
}
