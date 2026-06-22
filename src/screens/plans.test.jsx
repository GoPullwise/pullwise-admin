import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullwiseApi } from "../api/pullwise.js";
import { PlansScreen } from "./plans.jsx";

vi.mock("../api/pullwise.js", () => ({
  pullwiseApi: {
    system: {
      getSystemConfig: vi.fn(),
      updateSystemConfig: vi.fn(),
    },
  },
}));

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
    pullwiseApi.system.getSystemConfig.mockResolvedValue(systemConfigPayload);
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
    expect(screen.queryByText("Plan Agent Configs")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pro Codex model")).not.toBeInTheDocument();
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
