import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullwiseApi } from "../api/pullwise.js";
import { WorkersScreen } from "./workers.jsx";

vi.mock("../api/pullwise.js", () => ({
  pullwiseApi: {
    system: {
      listWorkers: vi.fn(),
      getWorkerDefaults: vi.fn(),
      releaseWorker: vi.fn(),
      createWorker: vi.fn(),
      getWorker: vi.fn(),
      updateWorker: vi.fn(),
      enableWorker: vi.fn(),
      disableWorker: vi.fn(),
      rotateWorkerToken: vi.fn(),
      deleteWorker: vi.fn(),
    },
  },
}));

const workers = [
  {
    worker_id: "wk_1",
    name: "US-East Worker",
    status: "idle",
    enabled: true,
    running_jobs: 0,
    max_concurrent_jobs: 1,
    provider: "codex",
    region: "us-east",
  },
];

describe("WorkersScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pullwiseApi.system.listWorkers.mockResolvedValue({ workers, items: workers });
    pullwiseApi.system.getWorkerDefaults.mockResolvedValue({
      workerVersion: "0.4.2",
      workerPackage:
        "https://github.com/GoPullwise/pullwise-worker/releases/download/v0.4.2/pullwise_worker-0.4.2-py3-none-any.whl",
      providerChain: ["codex"],
      defaults: { providerChain: ["codex"] },
    });
    pullwiseApi.system.getWorker.mockResolvedValue({ worker: workers[0], auditEvents: [], taskActivity: [] });
  });

  it("lists workers returned by the admin API", async () => {
    render(<WorkersScreen />);

    expect(await screen.findByText("US-East Worker")).toBeInTheDocument();
    expect(screen.getByText(/us-east/)).toBeInTheDocument();
  });

  it("shows the latest worker release and dispatches a new version", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.releaseWorker.mockResolvedValue({ version: "0.4.3", tag: "v0.4.3" });

    render(<WorkersScreen />);

    expect(await screen.findByText("0.4.2")).toBeInTheDocument();
    const versionInput = screen.getByLabelText(/new release version/i);
    await waitFor(() => expect(versionInput).toHaveValue("0.4.3"));

    await user.click(screen.getByRole("button", { name: /release worker/i }));

    await waitFor(() => expect(pullwiseApi.system.releaseWorker).toHaveBeenCalledWith({ version: "0.4.3" }));
    expect(await screen.findByText(/release workflow queued for v0.4.3/i)).toBeInTheDocument();
    expect(versionInput).toHaveValue("0.4.4");
  });

  it("refreshes the latest worker release without using the server cache", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.getWorkerDefaults
      .mockResolvedValueOnce({
        workerVersion: "0.5.4",
        latestWorkerVersion: "0.5.4",
      })
      .mockResolvedValueOnce({
        workerVersion: "0.5.4",
        latestWorkerVersion: "0.5.5",
      });

    render(<WorkersScreen />);

    expect(await screen.findByText("0.5.4")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^refresh$/i }));

    await waitFor(() => expect(pullwiseApi.system.getWorkerDefaults).toHaveBeenLastCalledWith({ refresh: "1" }));
    expect(await screen.findByText("0.5.5")).toBeInTheDocument();
    expect(screen.getByLabelText(/new release version/i)).toHaveValue("0.5.6");
  });

  it("creates a worker and shows the one-time token", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.createWorker.mockResolvedValue({
      worker: { worker_id: "wk_new", name: "New Worker" },
      worker_token: "pwk_once",
      install_commands: {
        standard: "curl -fsSL https://api.example.com/install-worker.sh | bash",
      },
    });

    render(<WorkersScreen />);

    await user.click(await screen.findByRole("button", { name: /register worker/i }));
    await user.type(screen.getByLabelText(/^name/i), "New Worker");
    await user.type(screen.getByLabelText(/^region/i), "eu-west");
    await user.click(screen.getByRole("button", { name: /^create worker$/i }));

    await waitFor(() => expect(pullwiseApi.system.createWorker).toHaveBeenCalled());
    const payload = pullwiseApi.system.createWorker.mock.calls.at(-1)[0];
    expect(payload).toMatchObject({
      name: "New Worker",
      provider: "codex",
      providerChain: ["codex"],
      region: "eu-west",
    });
    expect(payload).not.toHaveProperty("max_concurrent_jobs");
    expect(payload).not.toHaveProperty("provider_chain");
    expect(screen.queryByLabelText(/max concurrent jobs/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/pwk_once/)).toBeInTheDocument();
    expect(screen.getByText(/install-worker\.sh/)).toBeInTheDocument();
    expect(screen.queryByText("Worker token")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^create worker$/i })).not.toBeInTheDocument();
    const footer = screen.getByText("Close").closest(".modal-foot");
    expect(footer).toBeTruthy();
    expect(within(footer).getByRole("button", { name: /^close$/i })).toBeInTheDocument();
    expect(pullwiseApi.system.createWorker).toHaveBeenCalledTimes(1);
  });

  it("does not show Agent CLI copy in the register worker modal", async () => {
    const user = userEvent.setup();

    render(<WorkersScreen />);

    await user.click(await screen.findByRole("button", { name: /register worker/i }));
    expect(screen.queryByText("Agent CLI")).not.toBeInTheDocument();
    expect(screen.queryByText("Codex CLI")).not.toBeInTheDocument();
  });

  it("defaults the create worker version to the latest release while keeping it editable", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.getWorkerDefaults.mockResolvedValue({
      workerVersion: "0.2.3",
      workerPackage:
        "https://github.com/GoPullwise/pullwise-worker/releases/download/v0.2.3/pullwise_worker-0.2.3-py3-none-any.whl",
      providerChain: ["codex"],
    });
    pullwiseApi.system.createWorker.mockResolvedValue({
      worker: { worker_id: "wk_new", name: "Latest Worker" },
      worker_token: "pwk_once",
    });

    render(<WorkersScreen />);

    await user.click(await screen.findByRole("button", { name: /register worker/i }));
    const versionInput = await screen.findByLabelText(/^version/i);
    await waitFor(() => expect(versionInput).toHaveValue("0.2.3"));

    await user.clear(versionInput);
    await user.type(versionInput, "0.2.4");
    await user.click(screen.getByRole("button", { name: /^create worker$/i }));

    await waitFor(() =>
      expect(pullwiseApi.system.createWorker).toHaveBeenCalledWith(
        expect.objectContaining({ version: "0.2.4" })
      )
    );
  });

  it("calls worker action endpoints", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.getWorker.mockResolvedValue({ worker: workers[0], auditEvents: [] });
    pullwiseApi.system.disableWorker.mockResolvedValue({ worker: { ...workers[0], enabled: false } });
    pullwiseApi.system.enableWorker.mockResolvedValue({ worker: workers[0] });
    pullwiseApi.system.updateWorker.mockResolvedValue({ worker: workers[0] });
    pullwiseApi.system.rotateWorkerToken.mockResolvedValue({
      worker_token: "pwk_rotated",
      install_commands: {
        standard: "curl -fsSL https://api.example.com/install-worker.sh | bash",
      },
    });
    pullwiseApi.system.deleteWorker.mockResolvedValue({ deleted: true });

    render(<WorkersScreen />);

    await user.click((await screen.findByText("US-East Worker")).closest(".worker-row-main"));
    expect(screen.queryByRole("button", { name: /health check/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^stop service$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^remove record$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^disable$/i }));
    await user.click(screen.getByRole("button", { name: /edit/i }));
    await user.clear(screen.getByLabelText(/region/i));
    await user.type(screen.getByLabelText(/region/i), "eu-west");
    await user.click(screen.getByRole("button", { name: /save/i }));
    await user.click(screen.getByRole("button", { name: /rotate token/i }));
    const rotatedToken = await screen.findByText("pwk_rotated");
    const workerRow = rotatedToken.closest(".worker-row");
    expect(workerRow).toBeTruthy();
    expect(within(workerRow).getByText("US-East Worker")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^delete instance$/i }));
    await user.click(screen.getByRole("button", { name: /confirm delete instance/i }));

    await waitFor(() => expect(pullwiseApi.system.disableWorker).toHaveBeenCalledWith("wk_1"));
    expect(pullwiseApi.system.updateWorker).toHaveBeenCalledWith("wk_1", expect.objectContaining({ region: "eu-west" }));
    expect(pullwiseApi.system.rotateWorkerToken).toHaveBeenCalledWith("wk_1");
    expect(pullwiseApi.system.deleteWorker).toHaveBeenCalledWith("wk_1");
    expect(await screen.findByText(/Worker instance deleted/i)).toBeInTheDocument();
    expect(screen.queryByText(/install-worker\.sh/)).not.toBeInTheDocument();
  });

  it("clears a rotated worker token after refreshing workers", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.rotateWorkerToken.mockResolvedValue({ worker_token: "pwk_rotated" });

    render(<WorkersScreen />);

    await user.click((await screen.findByText("US-East Worker")).closest(".worker-row-main"));
    await user.click(screen.getByRole("button", { name: /rotate token/i }));

    expect(await screen.findByText("pwk_rotated")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^refresh$/i }));

    await waitFor(() => expect(screen.queryByText("pwk_rotated")).not.toBeInTheDocument());
  });

  it("shows recent task activity for the expanded worker", async () => {
    const user = userEvent.setup();
    const today = new Date();
    const todayNoonSeconds = Math.floor(
      new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0).getTime() / 1000
    );
    pullwiseApi.system.getWorker.mockResolvedValue({
      worker: workers[0],
      auditEvents: [],
      taskActivity: [
        {
          worker_id: "wk_1",
          job_id: "job_1",
          scan_id: "sc_1",
          repo: "acme/api",
          branch: "main",
          status: "done",
          attempt: 1,
          claimed_at: todayNoonSeconds - 3600,
          started_at: todayNoonSeconds - 3500,
          completed_at: todayNoonSeconds - 3200,
          last_activity_at: todayNoonSeconds - 3200,
        },
      ],
    });

    render(<WorkersScreen />);

    await user.click((await screen.findByText("US-East Worker")).closest(".worker-row-main"));

    const activitySection = (await screen.findByText("Task activity")).closest(".worker-activity");
    expect(within(activitySection).getByText("1")).toBeInTheDocument();
    expect(within(activitySection).getByText("task today")).toBeInTheDocument();
    expect(within(activitySection).getByText("acme/api")).toBeInTheDocument();
    expect(within(activitySection).getByText(/Claimed/i)).toBeInTheDocument();
    expect(within(activitySection).getByText(/Started/i)).toBeInTheDocument();
    expect(within(activitySection).getByText(/Completed/i)).toBeInTheDocument();
  });

  it("counts running activity by last activity time instead of start time", async () => {
    const user = userEvent.setup();
    const today = new Date();
    const todayStartSeconds = Math.floor(
      new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).getTime() / 1000
    );
    const todayNoonSeconds = todayStartSeconds + 12 * 60 * 60;
    const yesterdaySeconds = todayStartSeconds - 60 * 60;
    pullwiseApi.system.getWorker.mockResolvedValue({
      worker: workers[0],
      auditEvents: [],
      taskActivity: [
        {
          worker_id: "wk_1",
          job_id: "job_1",
          scan_id: "sc_1",
          repo: "acme/api",
          branch: "main",
          status: "running",
          attempt: 1,
          claimed_at: yesterdaySeconds,
          started_at: yesterdaySeconds,
          completed_at: null,
          last_activity_at: todayNoonSeconds,
        },
      ],
    });

    render(<WorkersScreen />);

    await user.click((await screen.findByText("US-East Worker")).closest(".worker-row-main"));

    const activitySection = (await screen.findByText("Task activity")).closest(".worker-activity");
    expect(within(activitySection).getByText("1")).toBeInTheDocument();
    expect(within(activitySection).getByText("task today")).toBeInTheDocument();
  });

  it("renders fresher health fields from the worker detail endpoint", async () => {
    const user = userEvent.setup();
    const heartbeatSeconds = Date.UTC(2026, 5, 9, 10, 0, 0) / 1000;
    const formattedHeartbeat = new Date(heartbeatSeconds * 1000).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    pullwiseApi.system.getWorker.mockResolvedValue({
      worker: {
        ...workers[0],
        hostname: "detail-host",
        last_heartbeat_at: heartbeatSeconds,
      },
      auditEvents: [],
      taskActivity: [],
    });

    render(<WorkersScreen />);

    await user.click((await screen.findByText("US-East Worker")).closest(".worker-row-main"));

    expect(await screen.findByText("detail-host")).toBeInTheDocument();
    expect(screen.getByText(formattedHeartbeat)).toBeInTheDocument();
    expect(screen.queryByText(String(heartbeatSeconds))).not.toBeInTheDocument();
  });

  it("renders worker machine metrics as charts", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.getWorker.mockResolvedValue({
      worker: {
        ...workers[0],
        machineMetrics: {
          collectedAt: 1781200060,
          worker: { platform: "Linux-6.8", machine: "x86_64", pythonVersion: "3.10.12" },
          memory: { totalBytes: 8589934592, usedBytes: 5368709120, usedPercent: 62.5 },
          storage: { totalBytes: 107374182400, usedBytes: 42949672960, usedPercent: 40.0 },
          history: [
            {
              collectedAt: 1781200000,
              memory: { usedPercent: 58.2 },
              storage: { usedPercent: 39.7 },
            },
            {
              collectedAt: 1781200060,
              memory: { usedPercent: 62.5 },
              storage: { usedPercent: 40.0 },
            },
          ],
        },
      },
      auditEvents: [],
      taskActivity: [],
    });

    render(<WorkersScreen />);

    await user.click((await screen.findByText("US-East Worker")).closest(".worker-row-main"));

    expect(await screen.findByText("Machine metrics")).toBeInTheDocument();
    expect(screen.getByText("62.5%")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /worker ram usage over time/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /worker storage usage over time/i })).toBeInTheDocument();
  });

  it("renders Never when the worker detail has no heartbeat", async () => {
    const user = userEvent.setup();

    render(<WorkersScreen />);

    await user.click((await screen.findByText("US-East Worker")).closest(".worker-row-main"));

    expect(await screen.findByText("Never")).toBeInTheDocument();
  });

  it("hides fixed worker capacity and does not submit it while saving configuration", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.updateWorker.mockResolvedValue({ worker: workers[0] });

    render(<WorkersScreen />);

    await user.click((await screen.findByText("US-East Worker")).closest(".worker-row-main"));
    expect(screen.getByText(/idle.*us-east/i)).toBeInTheDocument();
    expect(screen.queryByText(/0\/1 jobs/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1\/1 jobs/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /edit/i }));
    expect(screen.queryByLabelText(/max concurrent jobs/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(pullwiseApi.system.updateWorker).toHaveBeenCalledWith(
        "wk_1",
        expect.not.objectContaining({ max_concurrent_jobs: expect.anything() })
      )
    );
  });

  it("keeps worker edits open when saving fails", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.updateWorker.mockRejectedValueOnce(new Error("patch failed"));

    render(<WorkersScreen />);

    await user.click((await screen.findByText("US-East Worker")).closest(".worker-row-main"));
    await user.click(screen.getByRole("button", { name: /edit/i }));
    const region = screen.getByLabelText(/region/i);
    await user.clear(region);
    await user.type(region, "eu-west");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText("patch failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/region/i)).toBeEnabled();
    expect(screen.getByLabelText(/region/i)).toHaveValue("eu-west");
  });

  it("disables instance deletion while a listed operational command is active", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.deleteWorker.mockResolvedValue({ deleted: true });
    pullwiseApi.system.listWorkers.mockResolvedValue({
      workers: [
        {
          ...workers[0],
          latest_command: { command: "uninstall", status: "pending" },
        },
      ],
    });

    render(<WorkersScreen />);

    await user.click((await screen.findByText("US-East Worker")).closest(".worker-row-main"));

    expect(screen.getByRole("button", { name: /^delete instance$/i })).toBeDisabled();
    expect(pullwiseApi.system.deleteWorker).not.toHaveBeenCalled();
  });

  it("disables instance deletion when the detail endpoint reports an active command", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.deleteWorker.mockResolvedValue({ deleted: true });
    pullwiseApi.system.listWorkers.mockResolvedValue({
      workers: [{ ...workers[0], latest_command: undefined }],
    });
    pullwiseApi.system.getWorker.mockResolvedValue({
      worker: {
        ...workers[0],
        latest_command: { command: "uninstall", status: "pending" },
      },
      auditEvents: [],
      taskActivity: [],
    });

    render(<WorkersScreen />);

    await user.click((await screen.findByText("US-East Worker")).closest(".worker-row-main"));

    await waitFor(() => expect(screen.getByRole("button", { name: /^delete instance$/i })).toBeDisabled());
    expect(pullwiseApi.system.deleteWorker).not.toHaveBeenCalled();
  });

  it("deletes a worker instance and removes it from the list", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.deleteWorker.mockResolvedValue({ deleted: true });

    render(<WorkersScreen />);

    await user.click((await screen.findByText("US-East Worker")).closest(".worker-row-main"));
    await user.click(screen.getByRole("button", { name: /^delete instance$/i }));
    await user.click(screen.getByRole("button", { name: /confirm delete instance/i }));

    await waitFor(() => expect(pullwiseApi.system.deleteWorker).toHaveBeenCalledWith("wk_1"));
    expect(screen.queryByText("US-East Worker")).not.toBeInTheDocument();
    expect(screen.getByText("Worker instance deleted.")).toBeInTheDocument();
  });

  it("copies install commands when clipboard is available", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    pullwiseApi.system.createWorker.mockResolvedValue({
      worker: { worker_id: "wk_new", name: "Copy Worker" },
      worker_token: "pwk_once",
      install_commands: {
        standard:
          "read -rsp 'Pullwise worker token: ' PULLWISE_WORKER_TOKEN; echo; export PULLWISE_WORKER_TOKEN; curl -fsSL https://api.example.com/install-worker.sh | bash",
      },
    });

    render(<WorkersScreen />);

    await user.click(await screen.findByRole("button", { name: /register worker/i }));
    await user.click(screen.getByRole("button", { name: /^create worker$/i }));
    const codeBlock = (await screen.findByText("Standard deployment")).closest(".code-block");
    await user.click(within(codeBlock).getByRole("button", { name: /copy/i }));

    expect(writeText).toHaveBeenCalledWith(
      "PULLWISE_WORKER_TOKEN='pwk_once'; export PULLWISE_WORKER_TOKEN; curl -fsSL https://api.example.com/install-worker.sh | bash"
    );
    expect(screen.queryByText(/read -rsp/)).not.toBeInTheDocument();
  });

  it("does not render unsupported top-level install command fields", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.createWorker.mockResolvedValue({
      worker: { worker_id: "wk_new", name: "Alias Worker" },
      worker_token: "pwk_once",
      install_command: "curl -fsSL https://api.example.com/unsupported.sh | bash",
    });

    render(<WorkersScreen />);

    await user.click(await screen.findByRole("button", { name: /register worker/i }));
    await user.click(screen.getByRole("button", { name: /^create worker$/i }));

    expect(await screen.findByText("pwk_once")).toBeInTheDocument();
    expect(screen.queryByText("Standard deployment")).not.toBeInTheDocument();
    expect(screen.queryByText(/unsupported\.sh/)).not.toBeInTheDocument();
  });
});
