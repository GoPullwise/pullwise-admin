import { useCallback, useEffect, useMemo, useState } from "react";
import { pullwiseApi } from "../api/pullwise.js";
import { I } from "../icons.jsx";
import { cloneSettings, isPlanSettingGroup, SettingField, setValueAt, valueAt } from "./settings.jsx";

const PLAN_ORDER = ["free", "pro", "max"];
const EFFORT_OPTIONS = ["low", "medium", "high", "xhigh"];

function itemsFrom(payload) {
  const plans = payload?.plans;
  if (Array.isArray(plans)) return plans;
  if (plans && typeof plans === "object") {
    return Object.entries(plans).map(([id, plan]) => ({ id, ...(plan || {}) }));
  }
  return [];
}

function titleCase(value) {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function textValue(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function effortValue(value) {
  const effort = textValue(value).toLowerCase();
  return EFFORT_OPTIONS.includes(effort) ? effort : "medium";
}

function formFromPlan(plan) {
  const agentConfig = plan?.agentConfig || {};
  const codex = agentConfig.codex || {};
  const id = textValue(plan?.id || agentConfig.plan, "free").toLowerCase();
  return {
    id,
    name: textValue(plan?.name, titleCase(id)),
    reviewLimit: plan?.reviewLimit ?? "",
    codexCli: textValue(codex.cli || codex.command, "codex"),
    codexReasoningEffort: effortValue(codex.reasoningEffort),
  };
}

function payloadFromForm(form) {
  return {
    codex: {
      cli: form.codexCli,
      reasoningEffort: form.codexReasoningEffort,
    },
  };
}

function sortPlans(plans) {
  return [...plans].sort((left, right) => {
    const leftIndex = PLAN_ORDER.indexOf(left.id);
    const rightIndex = PLAN_ORDER.indexOf(right.id);
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
  });
}

function planSettingGroups(payload) {
  return Array.isArray(payload?.groups) ? payload.groups.filter(isPlanSettingGroup) : [];
}

function SelectField({ label, value, onChange, children, ariaLabel, description }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select aria-label={ariaLabel || label} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
      {description && <small className="field-help">{description}</small>}
    </label>
  );
}

function TextField({ label, value, onChange, ariaLabel, description }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input aria-label={ariaLabel || label} value={value} onChange={(event) => onChange(event.target.value)} />
      {description && <small className="field-help">{description}</small>}
    </label>
  );
}

function PlanConfigCard({ form, saving, onChange, onSave }) {
  return (
    <article className="plan-config-card">
      <div className="plan-config-head">
        <div>
          <h2>{form.name}</h2>
          <div className="plan-config-meta">
            <span className="pill">{form.id}</span>
            <span>{form.reviewLimit} scans</span>
          </div>
        </div>
        <div className="plan-config-primary">
          <I.Bot size={15} />
          <span>Codex</span>
        </div>
      </div>

      <section className="plan-agent-config-section">
        <div className="plan-agent-config-head">
          <h3>Codex</h3>
          <p>Plan-level CLI and reasoning effort policy sent to worker jobs.</p>
        </div>
        <div className="form-grid">
          <TextField
            label="CLI"
            ariaLabel={`${form.name} Codex CLI`}
            value={form.codexCli}
            onChange={(value) => onChange(form.id, "codexCli", value)}
            description="Codex CLI label for this plan."
          />
          <SelectField
            label="Reasoning effort"
            ariaLabel={`${form.name} Codex effort`}
            value={form.codexReasoningEffort}
            onChange={(value) => onChange(form.id, "codexReasoningEffort", value)}
            description="Codex reasoning effort used for this plan."
          >
            {EFFORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SelectField>
        </div>
      </section>

      <div className="plan-config-actions">
        <button className="btn primary" type="button" onClick={() => onSave(form.id)} disabled={saving}>
          {saving ? <I.Refresh size={14} className="spin" /> : <I.Save size={14} />}
          Save {form.name}
        </button>
      </div>
    </article>
  );
}

export function PlansScreen() {
  const [forms, setForms] = useState({});
  const [systemPayload, setSystemPayload] = useState(null);
  const [planSettings, setPlanSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingPlan, setSavingPlan] = useState("");
  const [savingPlanSettings, setSavingPlanSettings] = useState(false);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [payload, nextSystemPayload] = await Promise.all([
        pullwiseApi.system.listPlanAgentConfigs(),
        pullwiseApi.system.getSystemConfig(),
      ]);
      const nextForms = {};
      for (const plan of itemsFrom(payload)) {
        const form = formFromPlan(plan);
        nextForms[form.id] = form;
      }
      setForms(nextForms);
      setSystemPayload(nextSystemPayload);
      setPlanSettings(cloneSettings(nextSystemPayload?.settings));
    } catch (err) {
      setError(err?.message || "Unable to load plan settings.");
      setForms({});
      setSystemPayload(null);
      setPlanSettings({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const plans = useMemo(() => sortPlans(Object.values(forms)), [forms]);
  const groups = useMemo(() => planSettingGroups(systemPayload), [systemPayload]);

  const updateField = (planId, field, value) => {
    setForms((current) => ({
      ...current,
      [planId]: { ...current[planId], [field]: value },
    }));
  };

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

  const savePlan = async (planId) => {
    const form = forms[planId];
    if (!form) return;
    setSavingPlan(planId);
    setError("");
    setMessage("");
    try {
      const payload = await pullwiseApi.system.updatePlanAgentConfig(planId, payloadFromForm(form));
      const updated = formFromPlan(payload.plan || { id: planId, name: form.name, agentConfig: payload.agentConfig });
      setForms((current) => ({ ...current, [planId]: updated }));
      setMessage(`${updated.name} agent config saved.`);
    } catch (err) {
      setError(err?.message || "Unable to save plan agent config.");
    } finally {
      setSavingPlan("");
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
      {!loading && plans.length > 0 && (
        <section className="plan-agents-panel">
          <div className="plan-settings-head">
            <div>
              <h2>Plan Agent Configs</h2>
              <p>Codex CLI and reasoning effort settings sent to workers for each plan.</p>
            </div>
          </div>
          <div className="plan-config-list">
            {plans.map((form) => (
              <PlanConfigCard
                key={form.id}
                form={form}
                saving={savingPlan === form.id}
                onChange={updateField}
                onSave={savePlan}
              />
            ))}
          </div>
        </section>
      )}
      {!loading && groups.length === 0 && plans.length === 0 && <div className="empty">No plan settings returned.</div>}
    </main>
  );
}
