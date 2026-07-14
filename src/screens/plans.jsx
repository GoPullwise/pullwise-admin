import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pullwiseApi } from "../api/pullwise.js";
import { I } from "../icons.jsx";
import {
  cloneSettings,
  isPlanSettingGroup,
  SettingField,
  settingsPayloadForGroups,
  settingsValidationError,
  setValueAt,
  valueAt,
} from "./settings.jsx";

const PLAN_ORDER = ["free", "pro", "max"];
const DEFAULT_EFFORT_OPTIONS = ["low", "medium", "high", "xhigh"];

function effortOptionsFrom(values) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .map((value) =>
          textValue(
            typeof value === "string" ? value : value?.reasoningEffort,
          ).toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
}

function effortPolicyFrom(payload) {
  const source = payload?.capabilities?.codex?.reasoningEffort;
  const defaultOptions = effortOptionsFrom(source?.defaultOptions);
  const modelFamilies = Array.isArray(source?.modelFamilies)
    ? source.modelFamilies
        .map((family) => ({
          modelPrefix: textValue(family?.modelPrefix).toLowerCase(),
          options: effortOptionsFrom(family?.options),
        }))
        .filter((family) => family.modelPrefix && family.options.length > 0)
    : [];
  const models = Array.isArray(source?.models)
    ? source.models
        .map((model) => ({
          id: textValue(model?.id || model?.model).toLowerCase(),
          options: effortOptionsFrom(model?.supportedReasoningEfforts),
        }))
        .filter((model) => model.id && model.options.length > 0)
    : [];
  return {
    defaultOptions:
      defaultOptions.length > 0 ? defaultOptions : DEFAULT_EFFORT_OPTIONS,
    modelFamilies,
    models,
  };
}

function effortOptionsForModel(model, policy) {
  const normalizedModel = textValue(model).toLowerCase();
  const exactModel = (policy?.models || []).find(
    ({ id }) => normalizedModel === id,
  );
  if (exactModel?.options?.length) return exactModel.options;
  const family = (policy?.modelFamilies || [])
    .filter(
      ({ modelPrefix }) =>
        normalizedModel === modelPrefix ||
        normalizedModel.startsWith(`${modelPrefix}-`),
    )
    .sort(
      (left, right) => right.modelPrefix.length - left.modelPrefix.length,
    )[0];
  return family?.options?.length
    ? family.options
    : policy?.defaultOptions?.length
      ? policy.defaultOptions
      : DEFAULT_EFFORT_OPTIONS;
}

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

function effortValue(value, model, policy) {
  const effort = textValue(value).toLowerCase();
  const options = effortOptionsForModel(model, policy);
  return options.includes(effort)
    ? effort
    : options.includes("medium")
      ? "medium"
      : options[0];
}

function numberText(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : String(fallback);
}

function integerFieldValue(value) {
  const raw = String(value ?? "").trim();
  if (!/^-?\d+$/.test(raw)) return null;
  const number = Number(raw);
  return Number.isSafeInteger(number) ? number : null;
}

function planFormValidationError(form, effortPolicy) {
  const effortOptions = effortOptionsForModel(form.codexModel, effortPolicy);
  if (!effortOptions.includes(form.codexReasoningEffort)) {
    return `Codex reasoning effort must be one of: ${effortOptions.join(", ")}.`;
  }
  const reviewerConcurrency = integerFieldValue(form.reviewerConcurrency);
  if (
    reviewerConcurrency === null ||
    reviewerConcurrency < 1 ||
    reviewerConcurrency > 2
  ) {
    return "Concurrent reviewer assignments must be an integer between 1 and 2.";
  }
  const turnTimeoutSeconds = integerFieldValue(form.turnTimeoutSeconds);
  if (
    turnTimeoutSeconds === null ||
    turnTimeoutSeconds < 60 ||
    turnTimeoutSeconds > 3600
  ) {
    return "Codex turn timeout must be an integer between 60 and 3600 seconds.";
  }
  const scanDeadlineSeconds = integerFieldValue(form.scanDeadlineSeconds);
  if (
    scanDeadlineSeconds === null ||
    scanDeadlineSeconds < 0 ||
    scanDeadlineSeconds > 21600
  ) {
    return "Scan deadline must be an integer between 0 and 21600 seconds.";
  }
  return "";
}

function formFromPlan(plan, effortPolicy) {
  const agentConfig = plan?.agentConfig || {};
  const codex = agentConfig.codex || {};
  const reviewWorker = agentConfig.reviewWorker || {};
  const id = textValue(plan?.id || agentConfig.plan, "free").toLowerCase();
  return {
    id,
    name: textValue(plan?.name, titleCase(id)),
    reviewLimit: plan?.reviewLimit ?? "",
    codexModel: textValue(codex.model, "gpt-5.5"),
    codexReasoningEffort: effortValue(
      codex.reasoningEffort,
      codex.model,
      effortPolicy,
    ),
    reviewerConcurrency: numberText(reviewWorker.reviewerConcurrency, 2),
    turnTimeoutSeconds: numberText(reviewWorker.turnTimeoutSeconds, 3600),

    scanDeadlineSeconds: numberText(reviewWorker.scanDeadlineSeconds, 14400),
  };
}

function payloadFromForm(form) {
  return {
    codex: {
      model: form.codexModel,
      reasoningEffort: form.codexReasoningEffort,
    },
    reviewWorker: {
      reviewerConcurrency: integerFieldValue(form.reviewerConcurrency),
      turnTimeoutSeconds: integerFieldValue(form.turnTimeoutSeconds),
      scanDeadlineSeconds: integerFieldValue(form.scanDeadlineSeconds),
    },
  };
}

function sortPlans(plans) {
  return [...plans].sort((left, right) => {
    const leftIndex = PLAN_ORDER.indexOf(left.id);
    const rightIndex = PLAN_ORDER.indexOf(right.id);
    return (
      (leftIndex === -1 ? 99 : leftIndex) -
      (rightIndex === -1 ? 99 : rightIndex)
    );
  });
}

function planSettingGroups(payload) {
  return Array.isArray(payload?.groups)
    ? payload.groups.filter(isPlanSettingGroup)
    : [];
}

function SelectField({
  label,
  value,
  onChange,
  children,
  ariaLabel,
  description,
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        aria-label={ariaLabel || label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
      {description && <small className="field-help">{description}</small>}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  ariaLabel,
  description,
  type = "text",
  min,
  max,
  step,
  inputMode,
  onBlur,
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={ariaLabel || label}
        type={type}
        min={min}
        max={max}
        step={step}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {description && <small className="field-help">{description}</small>}
    </label>
  );
}

function PlanConfigCard({
  form,
  effortPolicy,
  saving,
  onChange,
  onModelBlur,
  onSave,
}) {
  const effortOptions = effortOptionsForModel(form.codexModel, effortPolicy);
  const unsupportedEffort = !effortOptions.includes(form.codexReasoningEffort)
    ? form.codexReasoningEffort
    : "";
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
          <p>
            Plan-level model and reasoning effort policy sent to worker jobs.
          </p>
        </div>
        <div className="form-grid">
          <TextField
            label="Model"
            ariaLabel={`${form.name} Codex model`}
            value={form.codexModel}
            onChange={(value) => onChange(form.id, "codexModel", value)}
            onBlur={() => onModelBlur(form.id)}
            description="Codex model used for this plan."
          />
          <SelectField
            label="Reasoning effort"
            ariaLabel={`${form.name} Codex effort`}
            value={form.codexReasoningEffort}
            onChange={(value) =>
              onChange(form.id, "codexReasoningEffort", value)
            }
            description={`Available for this model: ${effortOptions.join(", ")}.`}
          >
            {unsupportedEffort && (
              <option value={unsupportedEffort} disabled>
                {unsupportedEffort} (unsupported)
              </option>
            )}
            {effortOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </SelectField>
        </div>
      </section>

      <section className="plan-agent-config-section">
        <div className="plan-agent-config-head">
          <h3>Review Worker Policy</h3>
          <p>
            Reviewer fanout concurrency, Codex turn timeout, and scan deadline
            policy sent to worker jobs for this plan.
          </p>
        </div>
        <div className="form-grid">
          <TextField
            label="Concurrent reviewer assignments"
            ariaLabel={`${form.name} Concurrent reviewer assignments`}
            type="number"
            min={1}
            max={2}
            step={1}
            inputMode="numeric"
            value={form.reviewerConcurrency}
            onChange={(value) =>
              onChange(form.id, "reviewerConcurrency", value)
            }
            description="Independent reviewer threads inside one worker-owned Codex App Server; use 1 to disable fanout concurrency."
          />

          <TextField
            label="Codex turn timeout seconds"
            ariaLabel={`${form.name} Codex turn timeout seconds`}
            type="number"
            min={60}
            max={3600}
            step={1}
            inputMode="numeric"
            value={form.turnTimeoutSeconds}
            onChange={(value) => onChange(form.id, "turnTimeoutSeconds", value)}
            description="Maximum time for one Codex turn (60–3600 seconds)."
          />

          <TextField
            label="Scan deadline seconds"
            ariaLabel={`${form.name} Scan deadline seconds`}
            type="number"
            min={0}
            max={21600}
            step={1}
            inputMode="numeric"
            value={form.scanDeadlineSeconds}
            onChange={(value) =>
              onChange(form.id, "scanDeadlineSeconds", value)
            }
            description="Total worker-side deadline for one scan job (0–21600 seconds; 0 disables it)."
          />
        </div>
      </section>

      <div className="plan-config-actions">
        <button
          className="btn primary"
          type="button"
          onClick={() => onSave(form.id)}
          disabled={saving}
        >
          {saving ? (
            <I.Refresh size={14} className="spin" />
          ) : (
            <I.Save size={14} />
          )}
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
  const [effortPolicy, setEffortPolicy] = useState(() =>
    effortPolicyFrom(null),
  );
  const savesInFlightRef = useRef(new Set());
  const loadingRef = useRef(false);
  const loadRequestRef = useRef(0);
  const formRevisionRef = useRef({});
  const planSettingsRevisionRef = useRef(0);

  const loadPlans = useCallback(async () => {
    if (loadingRef.current || savesInFlightRef.current.size > 0) return;
    loadingRef.current = true;
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setLoading(true);
    setError("");
    try {
      const [payload, nextSystemPayload] = await Promise.all([
        pullwiseApi.system.listPlanAgentConfigs(),
        pullwiseApi.system.getSystemConfig(),
      ]);
      if (loadRequestRef.current !== requestId) return;
      const nextEffortPolicy = effortPolicyFrom(payload);
      const nextForms = {};
      for (const plan of itemsFrom(payload)) {
        const form = formFromPlan(plan, nextEffortPolicy);
        nextForms[form.id] = form;
      }
      setForms(nextForms);
      setEffortPolicy(nextEffortPolicy);
      setSystemPayload(nextSystemPayload);
      setPlanSettings(cloneSettings(nextSystemPayload?.settings));
    } catch (err) {
      if (loadRequestRef.current !== requestId) return;
      setError(err?.message || "Unable to load plan settings.");
      setForms({});
      setEffortPolicy(effortPolicyFrom(null));
      setSystemPayload(null);
      setPlanSettings({});
    } finally {
      loadingRef.current = false;
      if (loadRequestRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
    return () => {
      loadRequestRef.current += 1;
      loadingRef.current = false;
    };
  }, [loadPlans]);

  const plans = useMemo(() => sortPlans(Object.values(forms)), [forms]);
  const groups = useMemo(
    () => planSettingGroups(systemPayload),
    [systemPayload],
  );

  const updateField = (planId, field, value) => {
    formRevisionRef.current[planId] =
      (formRevisionRef.current[planId] || 0) + 1;
    setForms((current) => ({
      ...current,
      [planId]: { ...current[planId], [field]: value },
    }));
  };

  const normalizeModelEffort = (planId) => {
    setForms((current) => {
      const form = current[planId];
      if (!form) return current;
      const options = effortOptionsForModel(form.codexModel, effortPolicy);
      if (options.includes(form.codexReasoningEffort)) return current;
      return {
        ...current,
        [planId]: {
          ...form,
          codexReasoningEffort: options[options.length - 1],
        },
      };
    });
  };

  const updatePlanSetting = (path, value) => {
    planSettingsRevisionRef.current += 1;
    setPlanSettings((current) => setValueAt(current, path, value));
  };

  const savePlanSettings = async () => {
    const saveKey = "plan-settings";
    if (savesInFlightRef.current.has(saveKey)) return;
    const validationError = settingsValidationError(planSettings, groups);
    if (validationError) {
      setError(validationError);
      setMessage("");
      return;
    }
    savesInFlightRef.current.add(saveKey);
    const submittedRevision = planSettingsRevisionRef.current;
    loadRequestRef.current += 1;
    loadingRef.current = false;
    setLoading(false);
    setSavingPlanSettings(true);
    setError("");
    setMessage("");
    try {
      const nextPayload = await pullwiseApi.system.updateSystemConfig({
        settings: settingsPayloadForGroups(planSettings, groups),
      });
      setSystemPayload(nextPayload);
      setPlanSettings((current) =>
        planSettingsRevisionRef.current === submittedRevision
          ? cloneSettings(nextPayload?.settings)
          : current,
      );
      setMessage("Plan settings saved.");
    } catch (err) {
      setError(err?.message || "Unable to save plan settings.");
    } finally {
      savesInFlightRef.current.delete(saveKey);
      setSavingPlanSettings(false);
    }
  };

  const savePlan = async (planId) => {
    const form = forms[planId];
    if (!form) return;
    const validationError = planFormValidationError(form, effortPolicy);
    if (validationError) {
      setError(validationError);
      setMessage("");
      return;
    }
    const saveKey = `plan:${planId}`;
    if (savesInFlightRef.current.has(saveKey)) return;
    savesInFlightRef.current.add(saveKey);
    const submittedRevision = formRevisionRef.current[planId] || 0;
    loadRequestRef.current += 1;
    loadingRef.current = false;
    setLoading(false);
    setSavingPlan(planId);
    setError("");
    setMessage("");
    try {
      const payload = await pullwiseApi.system.updatePlanAgentConfig(
        planId,
        payloadFromForm(form),
      );
      const updated = formFromPlan(
        payload.plan || {
          id: planId,
          name: form.name,
          agentConfig: payload.agentConfig,
        },
        effortPolicy,
      );
      setForms((current) =>
        (formRevisionRef.current[planId] || 0) === submittedRevision
          ? { ...current, [planId]: updated }
          : current,
      );
      setMessage(`${updated.name} agent config saved.`);
    } catch (err) {
      setError(err?.message || "Unable to save plan agent config.");
    } finally {
      savesInFlightRef.current.delete(saveKey);
      setSavingPlan((current) => (current === planId ? "" : current));
    }
  };

  return (
    <main className="main">
      <div className="page-head">
        <div>
          <h1>Plans</h1>
          <p>
            Plan quotas, billing catalog, and review agent policy for Free, Pro,
            and Max scan jobs.
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn"
            type="button"
            onClick={loadPlans}
            disabled={loading || savingPlanSettings || Boolean(savingPlan)}
          >
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
              <p>
                Quota and billing fields live here because they change how plans
                behave and are sold.
              </p>
            </div>
            <button
              className="btn primary"
              type="button"
              onClick={savePlanSettings}
              disabled={savingPlanSettings || loading}
            >
              {savingPlanSettings ? (
                <I.Refresh size={14} className="spin" />
              ) : (
                <I.Save size={14} />
              )}
              Save Plan Settings
            </button>
          </div>
          <div className="plan-settings-sections">
            {groups.map((group) => (
              <section
                className="settings-section"
                key={group.id || group.title}
              >
                <div className="settings-section-head">
                  <h2>{group.title}</h2>
                  <p>{group.description}</p>
                </div>
                <div className="settings-grid">
                  {(Array.isArray(group.fields) ? group.fields : []).map(
                    (field) => (
                      <SettingField
                        key={field.path}
                        field={field}
                        value={valueAt(planSettings, field.path)}
                        defaults={systemPayload?.defaults}
                        onChange={updatePlanSetting}
                        disabled={savingPlanSettings}
                      />
                    ),
                  )}
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
              <p>
                Codex model and reasoning effort settings sent to workers for
                each plan.
              </p>
            </div>
          </div>
          <div className="plan-config-list">
            {plans.map((form) => (
              <PlanConfigCard
                key={form.id}
                form={form}
                effortPolicy={effortPolicy}
                saving={savingPlan === form.id}
                onChange={updateField}
                onModelBlur={normalizeModelEffort}
                onSave={savePlan}
              />
            ))}
          </div>
        </section>
      )}
      {!loading && !error && groups.length === 0 && plans.length === 0 && (
        <div className="empty">No plan settings returned.</div>
      )}
    </main>
  );
}
