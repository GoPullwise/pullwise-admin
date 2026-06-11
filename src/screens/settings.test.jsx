import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullwiseApi } from "../api/pullwise.js";
import { SettingsScreen } from "./settings.jsx";

vi.mock("../api/pullwise.js", () => ({
  pullwiseApi: {
    system: {
      getSystemConfig: vi.fn(),
      updateSystemConfig: vi.fn(),
    },
  },
}));

describe("SettingsScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pullwiseApi.system.getSystemConfig.mockResolvedValue({
      settings: {
        plans: { pro: { userReviewLimit: 60 } },
        billing: { creemProProductIds: ["prod_monthly"] },
        scan: { maxRunningScansPerUser: 1 },
        worker: { maxClaimJobs: 2 },
      },
      groups: [
        {
          id: "plans",
          title: "Plan quotas",
          description: "Plan limits.",
          fields: [{ path: "plans.pro.userReviewLimit", label: "Pro user review limit", type: "integer" }],
        },
        {
          id: "billing",
          title: "Billing catalog",
          description: "Plan products.",
          fields: [{ path: "billing.creemProProductIds", label: "Creem Pro product IDs", type: "stringList" }],
        },
        {
          id: "scan",
          title: "Scan scheduling",
          description: "Queue settings.",
          fields: [{ path: "scan.maxRunningScansPerUser", label: "Max running scans per user", type: "integer" }],
        },
        {
          id: "worker",
          title: "Worker control plane",
          description: "Worker settings.",
          fields: [{ path: "worker.maxClaimJobs", label: "Max claim jobs", type: "integer" }],
        },
      ],
    });
  });

  it("keeps plan-related configuration out of the general settings page", async () => {
    render(<SettingsScreen />);

    expect(await screen.findByText("System Settings")).toBeInTheDocument();
    expect(screen.queryByText("Plan quotas")).not.toBeInTheDocument();
    expect(screen.queryByText("Billing catalog")).not.toBeInTheDocument();
    expect(screen.getByText("Scan scheduling")).toBeInTheDocument();
    expect(screen.getByText("Worker control plane")).toBeInTheDocument();
  });
});
