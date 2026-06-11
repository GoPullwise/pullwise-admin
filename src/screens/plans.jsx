import { useCallback, useEffect, useMemo, useState } from "react";
import { pullwiseApi } from "../api/pullwise.js";
import { I } from "../icons.jsx";

const PLAN_ORDER = ["free", "pro", "max"];
const PROVIDER_CHAIN_OPTIONS = [
  { value: "codex", label: "Codex" },
  { value: "opencode", label: "OpenCode" },
  { value: "codex,opencode", label: "Codex then OpenCode" },
  { value: "opencode,codex", label: "OpenCode then Codex" },
];
const EFFORT_OPTIONS = ["low", "medium", "high", "xhigh"];

function itemsFrom(payload) {
  const plans = payload?.plans;
  if (Array.isArray(plans)) return plans;
  if (plans && typeof plans === "object") {
    return Object.entries(plans).map(([id, plan]) => ({ id, ...(plan || {}) }));
  }
  const configs = payload?.agentConfigs;
  if (configs && typeof configs === "object") {
    return Object.entries(configs).map(([id, agentConfig]) => ({ id, name: titleCase(id), agentConfig }));
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

function planName(plan) {
  return textValue(plan?.name, titleCase(plan?.id));
}

function chainValue(agentConfig) {
  const chain = Array.isArray(agentConfig?.providerChain)
    ? agentConfig.providerChain
    : [agentConfig?.provider || agentConfig?.agent?.cli || "codex"];
  const normalized = chain.map((item) => textValue(item).toLowerCase()).filter(Boolean);
  return normalized.length ? normalized.join(",") : "codex";
}

function formFromPlan(plan) {
  const agentConfig = plan?.agentConfig || {};
  const codex = agentConfig.codex || {};
  const opencode = agentConfig.opencode || {};
  return {
    id: textValue(plan?.id || agentConfig.plan, "free").toLowerCase(),
    name: planName(plan),
    reviewLimit: plan?.reviewLimit ?? plan?.review_limit ?? "",
    providerChain: chainValue(agentConfig),
    codexCli: textValue(codex.cli || codex.command, "codex"),
    codexCommand: textValue(codex.command || codex.cli, "codex"),
    codexModel: textValue(codex.model, "gpt-5.5"),
    codexReasoningEffort: textValue(codex.reasoningEffort, "medium"),
    opencodeCli: textValue(opencode.cli || opencode.command, "opencode"),
    opencodeCommand: textValue(opencode.command || opencode.cli, "opencode"),
    opencodeModel: textValue(opencode.model, "opencode/big-pickle"),
    opencodeVariant: textValue(opencode.variant, "medium"),
  };
}

function payloadFromForm(form) {
  return {
    providerChain: form.providerChain.split(",").map((item) => item.trim()).filter(Boolean),
    codex: {
      cli: form.codexCli,
      command: form.codexCommand,
      model: form.codexModel,
      reasoningEffort: form.codexReasoningEffort,
    },
    opencode: {
      cli: form.opencodeCli,
      command: form.opencodeCommand,
      model: form.opencodeModel,
      variant: form.opencodeVariant,
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
  const primary = form.providerChain.split(",")[0] || "codex";
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
          <span>{primary}</span>
        </div>
      </div>

      <div className="form-grid compact">
        <SelectField
          label="Provider chain"
          ariaLabel={`${form.name} provider chain`}
          value={form.providerChain}
          onChange={(value) => onChange(form.id, "providerChain", value)}
          description="Ordered review providers sent in each worker job. The worker tries the next provider if the first one fails."
        >
          {PROVIDER_CHAIN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Codex effort"
          ariaLabel={`${form.name} Codex effort`}
          value={form.codexReasoningEffort}
          onChange={(value) => onChange(form.id, "codexReasoningEffort", value)}
          description="Codex reasoning effort used by worker CLI execution for this plan."
        >
          {EFFORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="OpenCode variant"
          ariaLabel={`${form.name} OpenCode variant`}
          value={form.opencodeVariant}
          onChange={(value) => onChange(form.id, "opencodeVariant", value)}
          description="OpenCode variant passed by the worker when OpenCode is selected."
        >
          {EFFORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="plan-config-columns">
        <section>
          <h3>Codex</h3>
          <div className="form-grid">
            <TextField
              label="CLI"
              ariaLabel={`${form.name} Codex CLI`}
              value={form.codexCli}
              onChange={(value) => onChange(form.id, "codexCli", value)}
              description="Human-readable Codex CLI label stored with this plan config."
            />
            <TextField
              label="Command"
              ariaLabel={`${form.name} Codex command`}
              value={form.codexCommand}
              onChange={(value) => onChange(form.id, "codexCommand", value)}
              description="Executable name the worker runs for Codex jobs."
            />
            <TextField
              label="Model"
              ariaLabel={`${form.name} Codex model`}
              value={form.codexModel}
              onChange={(value) => onChange(form.id, "codexModel", value)}
              description="Codex model passed to the worker CLI for this plan."
            />
          </div>
        </section>
        <section>
          <h3>OpenCode</h3>
          <div className="form-grid">
            <TextField
              label="CLI"
              ariaLabel={`${form.name} OpenCode CLI`}
              value={form.opencodeCli}
              onChange={(value) => onChange(form.id, "opencodeCli", value)}
              description="Human-readable OpenCode CLI label stored with this plan config."
            />
            <TextField
              label="Command"
              ariaLabel={`${form.name} OpenCode command`}
              value={form.opencodeCommand}
              onChange={(value) => onChange(form.id, "opencodeCommand", value)}
              description="Executable name the worker runs for OpenCode jobs."
            />
            <TextField
              label="Model"
              ariaLabel={`${form.name} OpenCode model`}
              value={form.opencodeModel}
              onChange={(value) => onChange(form.id, "opencodeModel", value)}
              description="OpenCode model passed to the worker CLI for this plan."
            />
          </div>
        </section>
      </div>

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingPlan, setSavingPlan] = useState("");

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await pullwiseApi.system.listPlanAgentConfigs();
      const nextForms = {};
      for (const plan of itemsFrom(payload)) {
        const form = formFromPlan(plan);
        nextForms[form.id] = form;
      }
      setForms(nextForms);
    } catch (err) {
      setError(err?.message || "Unable to load plan agent configs.");
      setForms({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const plans = useMemo(() => sortPlans(Object.values(forms)), [forms]);

  const updateField = (planId, field, value) => {
    setForms((current) => ({
      ...current,
      [planId]: { ...current[planId], [field]: value },
    }));
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
          <h1>Plan Agent Configs</h1>
          <p>Database-backed review agent policy for Free, Pro, and Max scan jobs.</p>
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

      {loading && <div className="empty">Loading plan agent configs...</div>}
      {!loading && plans.length === 0 && <div className="empty">No plan agent configs returned.</div>}
      {!loading && plans.length > 0 && (
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
      )}
    </main>
  );
}
