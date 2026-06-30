import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullwiseApi } from "../api/pullwise.js";
import { parseFieldValue, SettingsScreen } from "./settings.jsx";

vi.mock("../api/pullwise.js", () => ({
  pullwiseApi: {
    system: {
      getSystemConfig: vi.fn(),
      getServerMetrics: vi.fn(),
      updateSystemConfig: vi.fn(),
      restartServer: vi.fn(),
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
        scan: {
          maxQueuedScansGlobal: 1000,
          jobRetryAttempts: 1,
          jobLeaseSeconds: 14400,
        },
        worker: { codexTimeoutSeconds: 3600 },
        alerts: {
          email: {
            enabled: false,
            to: ["ops@example.com"],
            smtpHost: "smtp.example.com",
            smtpPort: 465,
            smtpUsername: "mailer",
            smtpPassword: "",
            smtpSsl: true,
            smtpStarttls: false,
          },
        },
      },
      secrets: {
        "alerts.email.smtpPassword": { hasValue: true },
      },
      groups: [
        {
          id: "plans",
          title: "Plan quotas",
          description: "Plan limits.",
          fields: [
            {
              path: "plans.pro.userReviewLimit",
              label: "Pro user review limit",
              type: "integer",
            },
          ],
        },
        {
          id: "billing",
          title: "Billing catalog",
          description: "Plan products.",
          fields: [
            {
              path: "billing.creemProProductIds",
              label: "Creem Pro product IDs",
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
            {
              path: "scan.jobRetryAttempts",
              label: "Scan job retry attempts",
              type: "integer",
              min: 0,
            },
            {
              path: "scan.jobLeaseSeconds",
              label: "Scan job lease seconds",
              type: "integer",
              min: 60,
            },
          ],
        },
        {
          id: "worker",
          title: "Worker control plane",
          description: "Worker settings.",
          fields: [
            {
              path: "worker.codexTimeoutSeconds",
              label: "Codex timeout seconds",
              type: "integer",
              min: 60,
            },
          ],
        },
        {
          id: "alerts",
          title: "Operational alerts",
          description: "Alert email settings.",
          fields: [
            {
              path: "alerts.email.enabled",
              label: "Alert email enabled",
              type: "boolean",
            },
            {
              path: "alerts.email.to",
              label: "Alert recipients",
              type: "stringList",
            },
            {
              path: "alerts.email.smtpHost",
              label: "SMTP host",
              type: "string",
            },
            {
              path: "alerts.email.smtpPort",
              label: "SMTP port",
              type: "integer",
              min: 1,
            },
            {
              path: "alerts.email.smtpUsername",
              label: "SMTP username",
              type: "string",
            },
            {
              path: "alerts.email.smtpPassword",
              label: "SMTP password",
              type: "password",
            },
          ],
        },
      ],
    });
    pullwiseApi.system.getServerMetrics.mockResolvedValue({
      ok: true,
      collectedAt: Date.UTC(2026, 5, 9, 10, 0, 0) / 1000,
      server: {
        hostname: "api-1",
        system: "Linux",
        release: "6.8.0",
        machine: "x86_64",
      },
      cpu: {
        logicalCount: 8,
        loadAverage: { oneMinute: 1.23, fiveMinute: 1.5, fifteenMinute: 1.75 },
      },
      memory: {
        totalBytes: 8 * 1024 ** 3,
        availableBytes: 6 * 1024 ** 3,
        usedBytes: 2 * 1024 ** 3,
        usedPercent: 25,
      },
      storage: {
        totalBytes: 128 * 1024 ** 3,
        freeBytes: 96 * 1024 ** 3,
        usedBytes: 32 * 1024 ** 3,
        usedPercent: 25,
      },
      history: [
        {
          collectedAt: Date.UTC(2026, 5, 9, 9, 50, 0) / 1000,
          memory: { usedPercent: 18 },
          storage: { usedPercent: 22 },
        },
        {
          collectedAt: Date.UTC(2026, 5, 9, 10, 0, 0) / 1000,
          memory: { usedPercent: 25 },
          storage: { usedPercent: 25 },
        },
      ],
    });
    pullwiseApi.system.restartServer.mockResolvedValue({
      ok: true,
      message: "Pullwise server restart started.",
      command: "bash launcher.sh restart",
    });
  });

  it("keeps plan-related configuration out of the general settings page", async () => {
    render(<SettingsScreen />);

    expect(await screen.findByText("System Settings")).toBeInTheDocument();
    expect(screen.queryByText("Plan quotas")).not.toBeInTheDocument();
    expect(screen.queryByText("Billing catalog")).not.toBeInTheDocument();
    expect(screen.getByText("Scan scheduling")).toBeInTheDocument();
    expect(screen.getByText("Worker control plane")).toBeInTheDocument();
    expect(screen.getByText("Operational alerts")).toBeInTheDocument();
    expect(screen.getByLabelText("Scan job retry attempts")).toHaveValue(1);
    expect(screen.queryByLabelText("Max claim jobs")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Scan job lease seconds")).toHaveValue(14400);
    expect(screen.getByLabelText("Codex timeout seconds")).toHaveValue(3600);
    expect(screen.getByLabelText("Alert recipients")).toHaveValue(
      "ops@example.com",
    );
  });

  it("renders server machine metrics from the admin API", async () => {
    render(<SettingsScreen />);

    expect(await screen.findByText("Server Machine")).toBeInTheDocument();
    expect(screen.getByText("RAM Usage")).toBeInTheDocument();
    expect(screen.getByText("Storage Usage")).toBeInTheDocument();
    expect(screen.getAllByText("25%").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("img", { name: /ram usage over time/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /storage usage over time/i }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll(".server-machine-chart-svg")).toHaveLength(
      2,
    );
    expect(screen.getByText("api-1")).toBeInTheDocument();
    expect(screen.queryByText(/CPU usage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/logical cores/i)).not.toBeInTheDocument();
    expect(pullwiseApi.system.getServerMetrics).toHaveBeenCalled();
  });

  it("renders saved SMTP password state without exposing the password", async () => {
    render(<SettingsScreen />);

    const password = await screen.findByLabelText(/SMTP password/);

    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveValue("");
    expect(password).toHaveAttribute(
      "placeholder",
      "Saved password configured",
    );
    expect(
      screen.getByText(/Saved password configured; leave blank to keep it\./),
    ).toBeInTheDocument();
  });

  it("requires confirmation before restarting the Pullwise server", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    const restart = await screen.findByRole("button", {
      name: /restart server/i,
    });
    await user.click(restart);

    expect(pullwiseApi.system.restartServer).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /confirm restart/i }));

    expect(pullwiseApi.system.restartServer).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText("Pullwise server restart started."),
    ).toBeInTheDocument();
  });

  it("expires restart confirmation before dispatching a restart", async () => {
    render(<SettingsScreen />);
    const restart = await screen.findByRole("button", {
      name: /restart server/i,
    });

    vi.useFakeTimers();
    try {
      fireEvent.click(restart);
      expect(
        screen.getByRole("button", { name: /confirm restart/i }),
      ).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(10001);
      });

      const expiredRestart = screen.getByRole("button", {
        name: /restart server/i,
      });
      fireEvent.click(expiredRestart);

      expect(pullwiseApi.system.restartServer).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: /confirm restart/i }),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not show empty config metadata when system config loading fails", async () => {
    pullwiseApi.system.getSystemConfig.mockRejectedValueOnce(
      new Error("config down"),
    );

    render(<SettingsScreen />);

    expect(await screen.findByRole("alert")).toHaveTextContent("config down");
    expect(
      screen.queryByText("No system config metadata returned."),
    ).not.toBeInTheDocument();
  });

  it("normalizes invalid numeric system setting edits to an empty value", () => {
    expect(parseFieldValue({ type: "integer" }, "abc")).toBe("");
    expect(parseFieldValue({ type: "number" }, "abc")).toBe("");
  });
});
