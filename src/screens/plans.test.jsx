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
    },
  },
}));

const proPlan = {
  id: "pro",
  name: "Pro",
  reviewLimit: 60,
  agentConfig: {
    plan: "pro",
    providerChain: ["codex"],
    agent: { cli: "codex", model: "gpt-5.5", reasoningEffort: "medium" },
    codex: { cli: "codex", command: "codex", model: "gpt-5.5", reasoningEffort: "medium" },
    opencode: { cli: "opencode", command: "opencode", model: "opencode/big-pickle", variant: "medium" },
  },
};

describe("PlansScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pullwiseApi.system.listPlanAgentConfigs.mockResolvedValue({ plans: [proPlan] });
  });

  it("loads plan agent configs from the admin API", async () => {
    render(<PlansScreen />);

    expect(await screen.findByText("Plan Agent Configs")).toBeInTheDocument();
    const card = (await screen.findByText("Pro")).closest(".plan-config-card");
    expect(within(card).getByText("60 scans")).toBeInTheDocument();
    expect(within(card).getByDisplayValue("gpt-5.5")).toBeInTheDocument();
  });

  it("saves edited provider and model settings for a plan", async () => {
    const user = userEvent.setup();
    const updatedPlan = {
      ...proPlan,
      agentConfig: {
        ...proPlan.agentConfig,
        providerChain: ["opencode", "codex"],
        agent: { cli: "opencode", model: "opencode/pro", reasoningEffort: "high" },
        codex: { cli: "codex", command: "codex", model: "gpt-pro", reasoningEffort: "high" },
        opencode: { cli: "opencode", command: "opencode", model: "opencode/pro", variant: "high" },
      },
    };
    pullwiseApi.system.updatePlanAgentConfig.mockResolvedValue({
      plan: updatedPlan,
      agentConfig: updatedPlan.agentConfig,
    });

    render(<PlansScreen />);

    await screen.findByText("Pro");
    await user.selectOptions(screen.getByLabelText("Pro provider chain"), "opencode,codex");
    await user.selectOptions(screen.getByLabelText("Pro Codex effort"), "high");
    await user.selectOptions(screen.getByLabelText("Pro OpenCode variant"), "high");
    await user.clear(screen.getByLabelText("Pro Codex model"));
    await user.type(screen.getByLabelText("Pro Codex model"), "gpt-pro");
    await user.clear(screen.getByLabelText("Pro OpenCode model"));
    await user.type(screen.getByLabelText("Pro OpenCode model"), "opencode/pro");
    await user.click(screen.getByRole("button", { name: /save pro/i }));

    await waitFor(() =>
      expect(pullwiseApi.system.updatePlanAgentConfig).toHaveBeenCalledWith(
        "pro",
        expect.objectContaining({
          providerChain: ["opencode", "codex"],
          codex: expect.objectContaining({ model: "gpt-pro", reasoningEffort: "high" }),
          opencode: expect.objectContaining({ model: "opencode/pro", variant: "high" }),
        })
      )
    );
    expect(await screen.findByText("Pro agent config saved.")).toBeInTheDocument();
  });
});
