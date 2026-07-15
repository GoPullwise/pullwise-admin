import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
        quota: { repositoryReviewLimit: 1000 },
        scan: {
          maxQueuedScansGlobal: 1000,
          jobRetryAttempts: 1,
          jobLeaseSeconds: 14400,
        },
        reviewWorker: {
          maxBundles: 24,
          maxReviewerAssignments: 48,
        },
        worker: { defaultVersion: "" },
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
          id: "quota",
          title: "Repository quota",
          description: "Global repository quota.",
          fields: [
            {
              path: "quota.repositoryReviewLimit",
              label: "Repository monthly review limit",
              type: "integer",
            },
          ],
        },        {
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
              max: 5,
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
              path: "worker.defaultVersion",
              label: "Default worker version",
              type: "string",
            },
          ],
        },
        {
          id: "reviewWorker",
          title: "Review phase limits",
          description: "Global review-stage limits.",
          fields: [
            {
              path: "reviewWorker.maxBundles",
              label: "Maximum review bundles",
              type: "integer",
              min: 1,
              max: 64,
            },
            {
              path: "reviewWorker.maxReviewerAssignments",
              label: "Maximum reviewer assignments",
              type: "integer",
              min: 1,
              max: 128,
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
            {
              path: "alerts.email.smtpSsl",
              label: "SMTP SSL",
              type: "boolean",
            },
            {
              path: "alerts.email.smtpStarttls",
              label: "SMTP STARTTLS",
              type: "boolean",
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
    expect(screen.queryByText("Repository quota")).not.toBeInTheDocument();
    expect(screen.getByText("Scan scheduling")).toBeInTheDocument();
    expect(screen.getByText("Worker control plane")).toBeInTheDocument();
    expect(screen.getByText("Review phase limits")).toBeInTheDocument();
    expect(screen.getByText("Operational alerts")).toBeInTheDocument();
    expect(screen.getByLabelText("Scan job retry attempts")).toHaveValue(1);
    expect(screen.queryByLabelText("Max claim jobs")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Scan job lease seconds")).toHaveValue(14400);
    expect(screen.getByLabelText("Default worker version")).toHaveValue("");
    const maxBundles = screen.getByLabelText("Maximum review bundles");
    const maxAssignments = screen.getByLabelText(
      "Maximum reviewer assignments",
    );
    expect(maxBundles).toHaveValue(24);
    expect(maxBundles).toHaveAttribute("min", "1");
    expect(maxBundles).toHaveAttribute("max", "64");
    expect(maxBundles).toHaveAttribute("step", "1");
    expect(maxAssignments).toHaveValue(48);
    expect(maxAssignments).toHaveAttribute("max", "128");
    expect(screen.getByLabelText("Alert recipients")).toHaveValue(
      "ops@example.com",
    );
  });

  it("renders server machine metrics from the admin API", async () => {
    const { container } = render(<SettingsScreen />);

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
    expect(container.querySelector('.server-machine-metric[data-metric="memory"] .lucide-memory-stick')).toBeInTheDocument();
    expect(container.querySelector('.server-machine-metric[data-metric="storage"] .lucide-hard-drive')).toBeInTheDocument();
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

  it("saves only visible system settings and preserves untouched saved secrets", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.updateSystemConfig.mockResolvedValue({
      settings: {
        scan: { maxQueuedScansGlobal: 1000, jobRetryAttempts: 2, jobLeaseSeconds: 14400 },
        reviewWorker: { maxBundles: 24, maxReviewerAssignments: 48 },
        worker: { defaultVersion: "" },
        alerts: {
          email: {
            enabled: false,
            to: ["ops@example.com"],
            smtpHost: "smtp.example.com",
            smtpPort: 465,
            smtpUsername: "mailer",
            smtpSsl: true,
            smtpStarttls: false,
          },
        },
      },
      groups: [],
    });

    render(<SettingsScreen />);

    await screen.findByText("System Settings");
    await user.clear(screen.getByLabelText("Scan job retry attempts"));
    await user.type(screen.getByLabelText("Scan job retry attempts"), "2");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(pullwiseApi.system.updateSystemConfig).toHaveBeenCalledTimes(1));
    const submitted = pullwiseApi.system.updateSystemConfig.mock.calls[0][0].settings;
    expect(submitted).toEqual({
      scan: { maxQueuedScansGlobal: 1000, jobRetryAttempts: 2, jobLeaseSeconds: 14400 },
      reviewWorker: { maxBundles: 24, maxReviewerAssignments: 48 },
      worker: { defaultVersion: "" },
      alerts: {
        email: {
          enabled: false,
          to: ["ops@example.com"],
          smtpHost: "smtp.example.com",
          smtpPort: 465,
          smtpUsername: "mailer",
          smtpSsl: true,
          smtpStarttls: false,
        },
      },
    });
    expect(submitted).not.toHaveProperty("plans");
    expect(submitted).not.toHaveProperty("billing");
    expect(submitted.alerts.email).not.toHaveProperty("smtpPassword");
  });

  it("coalesces same-frame system config saves", async () => {
    let resolveSave;
    pullwiseApi.system.updateSystemConfig.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    render(<SettingsScreen />);

    const save = await screen.findByRole("button", { name: /^save$/i });
    act(() => {
      save.click();
      save.click();
    });

    expect(pullwiseApi.system.updateSystemConfig).toHaveBeenCalledTimes(1);
    await act(async () => resolveSave({ settings: {}, groups: [] }));
  });

  it("locks setting inputs while their submitted snapshot is saving", async () => {
    let resolveSave;
    pullwiseApi.system.updateSystemConfig.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    render(<SettingsScreen />);

    const retryAttempts = await screen.findByLabelText("Scan job retry attempts");
    const save = screen.getByRole("button", { name: /^save$/i });
    act(() => save.click());

    expect(retryAttempts).toBeDisabled();
    await act(async () => resolveSave({ settings: {}, groups: [] }));
  });

  it("coalesces same-frame system config refreshes", async () => {
    render(<SettingsScreen />);
    await screen.findByText("System Settings");
    let resolveConfig;
    pullwiseApi.system.getSystemConfig.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveConfig = resolve;
      })
    );

    const refresh = screen.getByRole("button", { name: /^refresh$/i });
    act(() => {
      refresh.click();
      refresh.click();
    });

    expect(pullwiseApi.system.getSystemConfig).toHaveBeenCalledTimes(2);
    await act(async () => resolveConfig({ settings: {}, groups: [] }));
  });

  it("does not let an older refresh overwrite a completed settings save", async () => {
    render(<SettingsScreen />);
    const input = await screen.findByLabelText("Scan job retry attempts");
    const staleRefresh = {};
    staleRefresh.promise = new Promise((resolve) => {
      staleRefresh.resolve = resolve;
    });
    pullwiseApi.system.getSystemConfig.mockReturnValueOnce(staleRefresh.promise);
    pullwiseApi.system.updateSystemConfig.mockResolvedValueOnce({
      settings: { scan: { jobRetryAttempts: 2 } },
      groups: [
        {
          id: "scan",
          title: "Scan scheduling",
          fields: [
            {
              path: "scan.jobRetryAttempts",
              label: "Scan job retry attempts",
              type: "integer",
              min: 0,
              max: 5,
            },
          ],
        },
      ],
    });
    fireEvent.change(input, { target: { value: "2" } });

    act(() => {
      screen.getByRole("button", { name: /^refresh$/i }).click();
      screen.getByRole("button", { name: /^save$/i }).click();
    });
    await waitFor(() => expect(pullwiseApi.system.updateSystemConfig).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByLabelText("Scan job retry attempts")).toHaveValue(2));

    await act(async () => {
      staleRefresh.resolve({
        settings: { scan: { jobRetryAttempts: 1 } },
        groups: [],
      });
      await staleRefresh.promise;
    });

    expect(screen.getByLabelText("Scan job retry attempts")).toHaveValue(2);
  });
  it("keeps SMTP SSL and STARTTLS mutually exclusive", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    const ssl = await screen.findByLabelText(/^SMTP SSL/i);
    const starttls = screen.getByLabelText(/^SMTP STARTTLS/i);
    expect(ssl).toBeChecked();
    expect(starttls).not.toBeChecked();

    await user.click(starttls);
    expect(starttls).toBeChecked();
    expect(ssl).not.toBeChecked();

    await user.click(ssl);
    expect(ssl).toBeChecked();
    expect(starttls).not.toBeChecked();
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

  it("coalesces same-frame confirmed server restarts", async () => {
    let resolveRestart;
    pullwiseApi.system.restartServer.mockReturnValue(
      new Promise((resolve) => {
        resolveRestart = resolve;
      })
    );
    render(<SettingsScreen />);

    fireEvent.click(await screen.findByRole("button", { name: /restart server/i }));
    const confirm = screen.getByRole("button", { name: /confirm restart/i });
    act(() => {
      confirm.click();
      confirm.click();
    });

    expect(pullwiseApi.system.restartServer).toHaveBeenCalledTimes(1);
    await act(async () => resolveRestart({ message: "Pullwise server restart started." }));
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

  it("preserves fractional integer edits and blocks saving outside schema constraints", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    const retries = await screen.findByLabelText("Scan job retry attempts");
    expect(retries).toHaveAttribute("min", "0");
    expect(retries).toHaveAttribute("max", "5");
    expect(retries).toHaveAttribute("step", "1");
    await user.clear(retries);
    await user.type(retries, "2.5");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(pullwiseApi.system.updateSystemConfig).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Scan job retry attempts must be an integer."
    );
    expect(parseFieldValue({ type: "integer" }, "60.5")).toBe("60.5");
  });

  it("blocks global review phase limits outside their schema bounds", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    const maxBundles = await screen.findByLabelText("Maximum review bundles");
    await user.clear(maxBundles);
    await user.type(maxBundles, "65");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(pullwiseApi.system.updateSystemConfig).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Maximum review bundles must be at most 64.",
    );
  });
});
