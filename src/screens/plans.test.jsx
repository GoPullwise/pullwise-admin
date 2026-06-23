import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullwiseApi } from "../api/pullwise.js";
import { PlansScreen } from "./plans.jsx";

vi.mock("../api/pullwise.js", () => ({
  pullwiseApi: {
    system: {
      listPlanAgentConfigs: vi.fn(),
      updatePlanAgentConfig: vi.fn(),
      getSystemConfig: vi.fn(),
      updateSystemConfig: vi.fn(),
    },
  },
}));

const proPlan = {
  id: "pro",
  name: "Pro",
  reviewLimit: 60,
  agentConfig: {
    plan: "pro",
    provider: "codex",
    codex: { cli: "codex", command: "codex", model: "gpt-5.5", reasoningEffort: "medium" },
    graphVerified: { maxRepro: 20, minScoreForRepro: 8, requireRedGreen: false },
  },
};

const systemConfigPayload = {
  settings: {
    plans: {
      free: { userReviewLimit: 5, repositoryReviewLimit: 5, maxRepoFiles: 200, maxRepoBytes: 5 * 1024 * 1024 },
      pro: { userReviewLimit: 60, repositoryReviewLimit: 60, maxRepoFiles: 1000, maxRepoBytes: 20 * 1024 * 1024 },
      max: { userReviewLimit: 90, repositoryReviewLimit: 90, maxRepoFiles: 2000, maxRepoBytes: 50 * 1024 * 1024 },
    },
    billing: {
      creemProProductIds: ["prod_monthly"],
      creemMaxProductIds: [],
      creemTestMode: false,
      creemUpgradeBehavior: "proration-charge-immediately",
    },
    scan: { maxQueuedScansGlobal: 1000 },
  },
  defaults: {
    billing: {
      creemProProductIds: ["prod_recommended_monthly", "prod_recommended_yearly"],
      creemMaxProductIds: ["prod_recommended_max_monthly"],
    },
  },
  groups: [
    {
      id: "plans",
      title: "Plan quotas",
      description: "Monthly scan quotas by subscription plan.",
      fields: [
        { path: "plans.free.userReviewLimit", label: "Free user review limit", type: "integer", min: 0 },
        { path: "plans.free.maxRepoFiles", label: "Free repository file limit", type: "integer", min: 1 },
        { path: "plans.free.maxRepoBytes", label: "Free repository byte limit", type: "integer", min: 1 },
        { path: "plans.pro.userReviewLimit", label: "Pro user review limit", type: "integer", min: 0 },
        { path: "plans.pro.maxRepoFiles", label: "Pro repository file limit", type: "integer", min: 1 },
        { path: "plans.pro.maxRepoBytes", label: "Pro repository byte limit", type: "integer", min: 1 },
        { path: "plans.max.maxRepoFiles", label: "Max repository file limit", type: "integer", min: 1 },
        { path: "plans.max.maxRepoBytes", label: "Max repository byte limit", type: "integer", min: 1 },
      ],
    },
    {
      id: "billing",
      title: "Billing catalog",
      description: "Non-secret billing provider settings.",
      fields: [
        { path: "billing.creemProProductIds", label: "Creem Pro product IDs", type: "stringList" },
        { path: "billing.creemMaxProductIds", label: "Creem Max product IDs", type: "stringList" },
      ],
    },
    {
      id: "scan",
      title: "Scan scheduling",
      description: "Queue settings.",
      fields: [{ path: "scan.maxQueuedScansGlobal", label: "Max queued scans global", type: "integer" }],
    },
  ],
};

describe("PlansScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pullwiseApi.system.listPlanAgentConfigs.mockResolvedValue({ plans: [proPlan] });
    pullwiseApi.system.getSystemConfig.mockResolvedValue(systemConfigPayload);
  });

  it("loads the remaining plan agent config fields from the admin API", async () => {
    render(<PlansScreen />);

    expect(await screen.findByText("Plan Agent Configs")).toBeInTheDocument();
    const card = (await screen.findByText("Pro")).closest(".plan-config-card");
    expect(within(card).getByText("60 scans")).toBeInTheDocument();
    expect(screen.getByLabelText("Pro Codex CLI")).toHaveValue("codex");
    expect(screen.getByLabelText("Pro Codex model")).toHaveValue("gpt-5.5");
    expect(screen.getByLabelText("Pro Codex effort")).toHaveValue("medium");
    expect(screen.queryByLabelText("Pro Enable graph verification")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pro Graph verification max repro")).not.toBeInTheDocument();
  });

  it("saves edited CLI, model, and reasoning effort for a plan", async () => {
    const user = userEvent.setup();
    const updatedPlan = {
      ...proPlan,
      agentConfig: {
        ...proPlan.agentConfig,
        codex: {
          ...proPlan.agentConfig.codex,
          cli: "codex-pro",
          command: "codex-pro",
          model: "gpt-pro",
          reasoningEffort: "high",
        },
      },
    };
    pullwiseApi.system.updatePlanAgentConfig.mockResolvedValue({
      plan: updatedPlan,
      agentConfig: updatedPlan.agentConfig,
    });

    render(<PlansScreen />);

    await screen.findByText("Pro");
    await user.clear(screen.getByLabelText("Pro Codex CLI"));
    await user.type(screen.getByLabelText("Pro Codex CLI"), "codex-pro");
    await user.clear(screen.getByLabelText("Pro Codex model"));
    await user.type(screen.getByLabelText("Pro Codex model"), "gpt-pro");
    await user.selectOptions(screen.getByLabelText("Pro Codex effort"), "high");
    await user.click(screen.getByRole("button", { name: /save pro/i }));

    await waitFor(() => expect(pullwiseApi.system.updatePlanAgentConfig).toHaveBeenCalled());
    expect(pullwiseApi.system.updatePlanAgentConfig).toHaveBeenCalledWith("pro", {
      codex: { cli: "codex-pro", model: "gpt-pro", reasoningEffort: "high" },
    });
    expect(await screen.findByText("Pro agent config saved.")).toBeInTheDocument();
  });

  it("does not show an empty plan state when loading plans fails", async () => {
    pullwiseApi.system.listPlanAgentConfigs.mockRejectedValueOnce(new Error("plans down"));

    render(<PlansScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent("plans down");
    expect(screen.queryByText("No plan settings returned.")).not.toBeInTheDocument();
  });

  it("shows plan quotas and billing catalog from system config and saves them", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.updateSystemConfig.mockResolvedValue({
      ...systemConfigPayload,
      settings: {
        ...systemConfigPayload.settings,
        plans: {
          ...systemConfigPayload.settings.plans,
          pro: { ...systemConfigPayload.settings.plans.pro, userReviewLimit: 75 },
        },
      },
    });

    render(<PlansScreen />);

    expect(await screen.findByText("Plan Settings")).toBeInTheDocument();
    expect(screen.getByText("Plan quotas")).toBeInTheDocument();
    expect(screen.getByText("Billing catalog")).toBeInTheDocument();
    expect(screen.queryByText("Scan scheduling")).not.toBeInTheDocument();
    expect(screen.getByText("Plan Agent Configs")).toBeInTheDocument();
    expect(screen.getByLabelText("Pro Codex model")).toHaveValue("gpt-5.5");
    expect(screen.getByLabelText("Pro user review limit")).toHaveValue(60);
    expect(screen.getByLabelText("Pro repository file limit")).toHaveValue(1000);
    expect(screen.getByLabelText("Pro repository byte limit")).toHaveValue(20 * 1024 * 1024);
    expect(screen.getByLabelText("Creem Pro product IDs")).toHaveValue("prod_monthly");

    await user.clear(screen.getByLabelText("Pro user review limit"));
    await user.type(screen.getByLabelText("Pro user review limit"), "75");
    await user.clear(screen.getByLabelText("Pro repository file limit"));
    await user.type(screen.getByLabelText("Pro repository file limit"), "1200");
    await user.click(screen.getByRole("button", { name: /save plan settings/i }));

    await waitFor(() =>
      expect(pullwiseApi.system.updateSystemConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            plans: expect.objectContaining({
              pro: expect.objectContaining({ userReviewLimit: 75, maxRepoFiles: 1200 }),
            }),
          }),
        })
      )
    );
    expect(await screen.findByText("Plan settings saved.")).toBeInTheDocument();
  });
});
