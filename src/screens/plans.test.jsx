import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
    codex: {
      cli: "codex",
      command: "codex",
      model: "gpt-5.5",
      reasoningEffort: "medium",
    },
    reviewWorker: {
      reviewerConcurrency: 2,
      maxBundles: 24,
      maxReviewerAssignments: 48,
      turnTimeoutSeconds: 3600,
      scanDeadlineSeconds: 14400,
    },
  },
};

const agentCapabilities = {
  codex: {
    reasoningEffort: {
      defaultOptions: ["low", "medium", "high", "xhigh"],
      modelFamilies: [
        {
          modelPrefix: "gpt-5.6",
          options: ["low", "medium", "high", "xhigh", "max", "ultra"],
        },
      ],
    },
  },
};

const systemConfigPayload = {
  settings: {
    plans: {
      free: {
        userReviewLimit: 5,
        maxRepoFiles: 200,
        maxRepoBytes: 5 * 1024 * 1024,
      },
      pro: {
        userReviewLimit: 60,
        maxRepoFiles: 1000,
        maxRepoBytes: 20 * 1024 * 1024,
      },
      max: {
        userReviewLimit: 90,
        maxRepoFiles: 2000,
        maxRepoBytes: 50 * 1024 * 1024,
      },
    },
    billing: {
      creemProProductIds: ["prod_monthly"],
      creemMaxProductIds: [],
      creemTestMode: false,
      creemUpgradeBehavior: "proration-charge-immediately",
    },
    quota: { repositoryReviewLimit: 1000 },
    scan: { maxQueuedScansGlobal: 1000 },
  },
  defaults: {
    billing: {
      creemProProductIds: [
        "prod_recommended_monthly",
        "prod_recommended_yearly",
      ],
      creemMaxProductIds: ["prod_recommended_max_monthly"],
    },
  },
  groups: [
    {
      id: "plans",
      title: "Plan quotas",
      description: "Monthly scan quotas by subscription plan.",
      fields: [
        {
          path: "plans.free.userReviewLimit",
          label: "Free user review limit",
          type: "integer",
          min: 0,
        },
        {
          path: "plans.free.maxRepoFiles",
          label: "Free repository file limit",
          type: "integer",
          min: 1,
        },
        {
          path: "plans.free.maxRepoBytes",
          label: "Free repository byte limit",
          type: "integer",
          min: 1,
        },
        {
          path: "plans.pro.userReviewLimit",
          label: "Pro user review limit",
          type: "integer",
          min: 0,
        },
        {
          path: "plans.pro.maxRepoFiles",
          label: "Pro repository file limit",
          type: "integer",
          min: 1,
        },
        {
          path: "plans.pro.maxRepoBytes",
          label: "Pro repository byte limit",
          type: "integer",
          min: 1,
        },
        {
          path: "plans.max.maxRepoFiles",
          label: "Max repository file limit",
          type: "integer",
          min: 1,
        },
        {
          path: "plans.max.maxRepoBytes",
          label: "Max repository byte limit",
          type: "integer",
          min: 1,
        },
      ],
    },
    {
      id: "quota",
      title: "Repository quota",
      description: "Global monthly repository scan quota.",
      fields: [
        {
          path: "quota.repositoryReviewLimit",
          label: "Repository monthly review limit",
          type: "integer",
          min: 0,
        },
      ],
    },
    {
      id: "billing",
      title: "Billing catalog",
      description: "Non-secret billing provider settings.",
      fields: [
        {
          path: "billing.creemProProductIds",
          label: "Creem Pro product IDs",
          type: "stringList",
        },
        {
          path: "billing.creemMaxProductIds",
          label: "Creem Max product IDs",
          type: "stringList",
        },
      ],
    },
    {
      id: "scan",
      title: "Scan scheduling",
      description: "Queue settings.",
      fields: [
        {
          path: "scan.maxQueuedScansGlobal",
          label: "Max queued scans global",
          type: "integer",
        },
      ],
    },
  ],
};

describe("PlansScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pullwiseApi.system.listPlanAgentConfigs.mockResolvedValue({
      plans: [proPlan],
      capabilities: agentCapabilities,
    });
    pullwiseApi.system.getSystemConfig.mockResolvedValue(systemConfigPayload);
  });

  it("loads the remaining plan agent config fields from the admin API", async () => {
    render(<PlansScreen />);

    expect(await screen.findByText("Plan Agent Configs")).toBeInTheDocument();
    const card = (await screen.findByText("Pro")).closest(".plan-config-card");
    expect(within(card).getByText("60 scans")).toBeInTheDocument();
    expect(screen.queryByLabelText("Pro Codex CLI")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Pro Codex model")).toHaveValue("gpt-5.5");
    expect(screen.getByLabelText("Pro Codex effort")).toHaveValue("medium");
    const reviewerConcurrency = screen.getByLabelText(
      "Pro Concurrent reviewer assignments",
    );
    const maxBundles = screen.getByLabelText("Pro Maximum review bundles");
    const maxReviewerAssignments = screen.getByLabelText(
      "Pro Maximum reviewer assignments",
    );
    const turnTimeout = screen.getByLabelText("Pro Codex turn timeout seconds");
    const scanDeadline = screen.getByLabelText("Pro Scan deadline seconds");
    expect(reviewerConcurrency).toHaveValue(2);
    expect(reviewerConcurrency).toHaveAttribute("min", "1");
    expect(reviewerConcurrency).toHaveAttribute("max", "2");
    expect(reviewerConcurrency).toHaveAttribute("step", "1");
    expect(maxBundles).toHaveValue(24);
    expect(maxBundles).toHaveAttribute("min", "1");
    expect(maxBundles).toHaveAttribute("max", "64");
    expect(maxBundles).toHaveAttribute("step", "1");
    expect(maxReviewerAssignments).toHaveValue(48);
    expect(maxReviewerAssignments).toHaveAttribute("min", "1");
    expect(maxReviewerAssignments).toHaveAttribute("max", "128");
    expect(maxReviewerAssignments).toHaveAttribute("step", "1");
    expect(turnTimeout).toHaveValue(3600);
    expect(turnTimeout).toHaveAttribute("type", "number");
    expect(turnTimeout).toHaveAttribute("min", "60");
    expect(turnTimeout).toHaveAttribute("max", "3600");
    expect(turnTimeout).toHaveAttribute("step", "1");
    expect(scanDeadline).toHaveValue(14400);
    expect(scanDeadline).toHaveAttribute("type", "number");
    expect(scanDeadline).toHaveAttribute("min", "0");
    expect(scanDeadline).toHaveAttribute("max", "21600");
    expect(scanDeadline).toHaveAttribute("step", "1");
  });

  it("saves edited model, reasoning effort, and timeouts for a plan", async () => {
    const user = userEvent.setup();
    const updatedPlan = {
      ...proPlan,
      agentConfig: {
        ...proPlan.agentConfig,
        codex: {
          ...proPlan.agentConfig.codex,
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
    await user.clear(screen.getByLabelText("Pro Codex model"));
    await user.type(screen.getByLabelText("Pro Codex model"), "gpt-pro");
    await user.selectOptions(screen.getByLabelText("Pro Codex effort"), "high");
    await user.clear(screen.getByLabelText("Pro Codex turn timeout seconds"));
    await user.type(
      screen.getByLabelText("Pro Codex turn timeout seconds"),
      "3600",
    );
    await user.clear(screen.getByLabelText("Pro Scan deadline seconds"));
    await user.type(
      screen.getByLabelText("Pro Scan deadline seconds"),
      "14400",
    );
    await user.clear(screen.getByLabelText("Pro Maximum review bundles"));
    await user.type(screen.getByLabelText("Pro Maximum review bundles"), "20");
    await user.clear(
      screen.getByLabelText("Pro Maximum reviewer assignments"),
    );
    await user.type(
      screen.getByLabelText("Pro Maximum reviewer assignments"),
      "40",
    );
    await user.click(screen.getByRole("button", { name: /save pro/i }));

    await waitFor(() =>
      expect(pullwiseApi.system.updatePlanAgentConfig).toHaveBeenCalled(),
    );
    expect(pullwiseApi.system.updatePlanAgentConfig).toHaveBeenCalledWith(
      "pro",
      {
        codex: { model: "gpt-pro", reasoningEffort: "high" },
        reviewWorker: {
          reviewerConcurrency: 2,
          maxBundles: 20,
          maxReviewerAssignments: 40,
          turnTimeoutSeconds: 3600,
          scanDeadlineSeconds: 14400,
        },
      },
    );
    expect(
      await screen.findByText("Pro agent config saved."),
    ).toBeInTheDocument();
  });

  it("shows model-aware reasoning efforts and clamps an unsupported effort on model blur", async () => {
    const user = userEvent.setup();
    render(<PlansScreen />);

    await screen.findByText("Pro");
    const model = screen.getByLabelText("Pro Codex model");
    const effort = screen.getByLabelText("Pro Codex effort");
    expect(
      within(effort).queryByRole("option", { name: "max" }),
    ).not.toBeInTheDocument();
    expect(
      within(effort).queryByRole("option", { name: "ultra" }),
    ).not.toBeInTheDocument();

    await user.clear(model);
    await user.type(model, "gpt-5.6-sol");
    expect(
      within(effort).getByRole("option", { name: "max" }),
    ).toBeInTheDocument();
    expect(
      within(effort).getByRole("option", { name: "ultra" }),
    ).toBeInTheDocument();
    await user.selectOptions(effort, "ultra");

    await user.clear(model);
    await user.type(model, "gpt-5.5");
    await user.tab();

    expect(effort).toHaveValue("xhigh");
    expect(
      within(effort).queryByRole("option", { name: "max" }),
    ).not.toBeInTheDocument();
    expect(
      within(effort).queryByRole("option", { name: "ultra" }),
    ).not.toBeInTheDocument();
  });

  it("saves ultra for a GPT-5.6 family model", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.updatePlanAgentConfig.mockResolvedValue({
      plan: {
        ...proPlan,
        agentConfig: {
          ...proPlan.agentConfig,
          codex: { model: "gpt-5.6-terra", reasoningEffort: "ultra" },
        },
      },
    });
    render(<PlansScreen />);

    await screen.findByText("Pro");
    const model = screen.getByLabelText("Pro Codex model");
    await user.clear(model);
    await user.type(model, "gpt-5.6-terra");
    await user.selectOptions(
      screen.getByLabelText("Pro Codex effort"),
      "ultra",
    );
    await user.click(screen.getByRole("button", { name: /save pro/i }));

    await waitFor(() =>
      expect(pullwiseApi.system.updatePlanAgentConfig).toHaveBeenCalledWith(
        "pro",
        expect.objectContaining({
          codex: { model: "gpt-5.6-terra", reasoningEffort: "ultra" },
        }),
      ),
    );
  });

  it("uses exact model catalog efforts for future models without frontend changes", async () => {
    pullwiseApi.system.listPlanAgentConfigs.mockResolvedValue({
      plans: [
        {
          ...proPlan,
          agentConfig: {
            ...proPlan.agentConfig,
            codex: { model: "gpt-5.7-orbit", reasoningEffort: "deep" },
          },
        },
      ],
      capabilities: {
        codex: {
          reasoningEffort: {
            defaultOptions: ["low", "medium", "high", "xhigh"],
            models: [
              {
                id: "gpt-5.7-orbit",
                supportedReasoningEfforts: [
                  { reasoningEffort: "low", description: "Fast" },
                  { reasoningEffort: "medium", description: "Balanced" },
                  { reasoningEffort: "deep", description: "Deep" },
                ],
              },
            ],
          },
        },
      },
    });
    render(<PlansScreen />);

    const effort = await screen.findByLabelText("Pro Codex effort");
    expect(effort).toHaveValue("deep");
    expect(
      within(effort).getByRole("option", { name: "deep" }),
    ).toBeInTheDocument();
    expect(
      within(effort).queryByRole("option", { name: "xhigh" }),
    ).not.toBeInTheDocument();
  });

  it("coalesces same-frame plan agent saves", async () => {
    let resolveSave;
    pullwiseApi.system.updatePlanAgentConfig.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    render(<PlansScreen />);

    const save = await screen.findByRole("button", { name: /save pro/i });
    act(() => {
      save.click();
      save.click();
    });

    expect(pullwiseApi.system.updatePlanAgentConfig).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolveSave({
        plan: proPlan,
        agentConfig: proPlan.agentConfig,
      }),
    );
  });

  it("preserves edits made after a plan save starts", async () => {
    let resolveSave;
    const pendingSave = new Promise((resolve) => {
      resolveSave = resolve;
    });
    pullwiseApi.system.updatePlanAgentConfig.mockReturnValue(pendingSave);
    render(<PlansScreen />);

    const model = await screen.findByLabelText("Pro Codex model");
    fireEvent.change(model, { target: { value: "gpt-first" } });
    fireEvent.click(screen.getByRole("button", { name: /save pro/i }));
    fireEvent.change(model, { target: { value: "gpt-second" } });

    await act(async () => {
      resolveSave({
        plan: {
          ...proPlan,
          agentConfig: {
            ...proPlan.agentConfig,
            codex: { model: "gpt-first", reasoningEffort: "medium" },
          },
        },
      });
      await pendingSave;
    });

    expect(screen.getByLabelText("Pro Codex model")).toHaveValue("gpt-second");
  });

  it("does not start a stale plan refresh while a save is pending", async () => {
    let resolveSave;
    pullwiseApi.system.updatePlanAgentConfig.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    render(<PlansScreen />);

    const save = await screen.findByRole("button", { name: /save pro/i });
    const refresh = screen.getByRole("button", { name: /^refresh$/i });
    act(() => {
      save.click();
      refresh.click();
    });

    expect(pullwiseApi.system.updatePlanAgentConfig).toHaveBeenCalledTimes(1);
    expect(pullwiseApi.system.listPlanAgentConfigs).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolveSave({
        plan: proPlan,
        agentConfig: proPlan.agentConfig,
      }),
    );
  });

  it("coalesces same-frame plan refreshes", async () => {
    const refresh = {};
    refresh.promise = new Promise((resolve) => {
      refresh.resolve = resolve;
    });
    render(<PlansScreen />);
    await screen.findByText("Plan Agent Configs");
    pullwiseApi.system.listPlanAgentConfigs.mockReturnValueOnce(
      refresh.promise,
    );

    const button = screen.getByRole("button", { name: /^refresh$/i });
    act(() => {
      button.click();
      button.click();
    });

    expect(pullwiseApi.system.listPlanAgentConfigs).toHaveBeenCalledTimes(2);
    refresh.resolve({ plans: [proPlan] });
    await act(async () => refresh.promise);
  });

  it("blocks saving when a plan timeout is blank instead of sending a default", async () => {
    const user = userEvent.setup();
    render(<PlansScreen />);

    await screen.findByText("Pro");
    await user.clear(screen.getByLabelText("Pro Codex turn timeout seconds"));
    await user.click(screen.getByRole("button", { name: /save pro/i }));

    expect(pullwiseApi.system.updatePlanAgentConfig).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Codex turn timeout must be an integer between 60 and 3600 seconds.",
    );
  });

  it.each([
    [
      "Pro Codex turn timeout seconds",
      "60.5",
      "Codex turn timeout must be an integer between 60 and 3600 seconds.",
    ],
    [
      "Pro Scan deadline seconds",
      "21601",
      "Scan deadline must be an integer between 0 and 21600 seconds.",
    ],
    [
      "Pro Concurrent reviewer assignments",
      "3",
      "Concurrent reviewer assignments must be an integer between 1 and 2.",
    ],
    [
      "Pro Maximum review bundles",
      "65",
      "Maximum review bundles must be an integer between 1 and 64.",
    ],
    [
      "Pro Maximum reviewer assignments",
      "129",
      "Maximum reviewer assignments must be an integer between 1 and 128.",
    ],
  ])(
    "blocks saving an invalid timeout in %s",
    async (label, value, expectedMessage) => {
      const user = userEvent.setup();
      render(<PlansScreen />);

      await screen.findByText("Pro");
      const input = screen.getByLabelText(label);
      await user.clear(input);
      await user.type(input, value);
      await user.click(screen.getByRole("button", { name: /save pro/i }));

      expect(pullwiseApi.system.updatePlanAgentConfig).not.toHaveBeenCalled();
      expect(await screen.findByRole("alert")).toHaveTextContent(
        expectedMessage,
      );
    },
  );

  it("does not show an empty plan state when loading plans fails", async () => {
    pullwiseApi.system.listPlanAgentConfigs.mockRejectedValueOnce(
      new Error("plans down"),
    );

    render(<PlansScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent("plans down");
    expect(
      screen.queryByText("No plan settings returned."),
    ).not.toBeInTheDocument();
  });

  it("shows plan quotas and billing catalog from system config and saves them", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.updateSystemConfig.mockResolvedValue({
      ...systemConfigPayload,
      settings: {
        ...systemConfigPayload.settings,
        plans: {
          ...systemConfigPayload.settings.plans,
          pro: {
            ...systemConfigPayload.settings.plans.pro,
            userReviewLimit: 75,
          },
        },
      },
    });

    render(<PlansScreen />);

    expect(await screen.findByText("Plan Settings")).toBeInTheDocument();
    expect(screen.getByText("Plan quotas")).toBeInTheDocument();
    expect(screen.getByText("Billing catalog")).toBeInTheDocument();
    expect(screen.getByText("Repository quota")).toBeInTheDocument();
    expect(screen.queryByText("Scan scheduling")).not.toBeInTheDocument();
    expect(screen.getByText("Plan Agent Configs")).toBeInTheDocument();
    expect(screen.getByLabelText("Pro Codex model")).toHaveValue("gpt-5.5");
    expect(screen.getByLabelText("Pro user review limit")).toHaveValue(60);
    expect(screen.getByLabelText("Pro repository file limit")).toHaveValue(
      1000,
    );
    expect(screen.getByLabelText("Pro repository byte limit")).toHaveValue(
      20 * 1024 * 1024,
    );
    expect(
      screen.getByLabelText("Repository monthly review limit"),
    ).toHaveValue(1000);
    expect(screen.getByLabelText("Creem Pro product IDs")).toHaveValue(
      "prod_monthly",
    );

    await user.clear(screen.getByLabelText("Pro user review limit"));
    await user.type(screen.getByLabelText("Pro user review limit"), "75");
    await user.clear(screen.getByLabelText("Pro repository file limit"));
    await user.type(screen.getByLabelText("Pro repository file limit"), "1200");
    await user.clear(screen.getByLabelText("Repository monthly review limit"));
    await user.type(
      screen.getByLabelText("Repository monthly review limit"),
      "1500",
    );
    await user.click(
      screen.getByRole("button", { name: /save plan settings/i }),
    );

    await waitFor(() =>
      expect(pullwiseApi.system.updateSystemConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            plans: expect.objectContaining({
              pro: expect.objectContaining({
                userReviewLimit: 75,
                maxRepoFiles: 1200,
              }),
            }),
          }),
        }),
      ),
    );
    const submitted =
      pullwiseApi.system.updateSystemConfig.mock.calls[0][0].settings;
    expect(submitted).not.toHaveProperty("scan");
    expect(submitted).not.toHaveProperty("worker");
    expect(submitted).not.toHaveProperty("alerts");
    expect(submitted.plans.pro).toEqual(
      expect.objectContaining({ userReviewLimit: 75, maxRepoFiles: 1200 }),
    );
    expect(
      Object.keys(submitted.plans.pro).some(
        (key) =>
          key.toLowerCase().includes("repository") &&
          key.toLowerCase().includes("reviewlimit"),
      ),
    ).toBe(false);
    expect(submitted.quota).toEqual({ repositoryReviewLimit: 1500 });
    expect(submitted.billing).toEqual({
      creemProProductIds: ["prod_monthly"],
      creemMaxProductIds: [],
    });
    expect(submitted.billing).not.toHaveProperty("creemTestMode");
    expect(await screen.findByText("Plan settings saved.")).toBeInTheDocument();
  });

  it("locks plan settings during save without overwriting a same-frame edit", async () => {
    let resolveSave;
    const pendingSave = new Promise((resolve) => {
      resolveSave = resolve;
    });
    pullwiseApi.system.updateSystemConfig.mockReturnValue(pendingSave);
    render(<PlansScreen />);

    const limit = await screen.findByLabelText("Pro user review limit");
    fireEvent.change(limit, { target: { value: "75" } });
    const save = screen.getByRole("button", { name: /save plan settings/i });
    act(() => {
      save.click();
      fireEvent.change(limit, { target: { value: "80" } });
    });

    expect(limit).toBeDisabled();
    expect(limit).toHaveValue(80);

    await act(async () => {
      resolveSave({
        ...systemConfigPayload,
        settings: {
          ...systemConfigPayload.settings,
          plans: {
            ...systemConfigPayload.settings.plans,
            pro: {
              ...systemConfigPayload.settings.plans.pro,
              userReviewLimit: 75,
            },
          },
        },
      });
      await pendingSave;
    });

    expect(screen.getByLabelText("Pro user review limit")).toHaveValue(80);
    expect(screen.getByLabelText("Pro user review limit")).not.toBeDisabled();
  });
});
