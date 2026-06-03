import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullwiseApi } from "../api/pullwise.js";
import { WorkersScreen } from "./workers.jsx";

vi.mock("../api/pullwise.js", () => ({
  pullwiseApi: {
    system: {
      listWorkers: vi.fn(),
      createWorker: vi.fn(),
      getWorker: vi.fn(),
      updateWorker: vi.fn(),
      enableWorker: vi.fn(),
      disableWorker: vi.fn(),
      commandWorker: vi.fn(),
      rotateWorkerToken: vi.fn(),
      testWorker: vi.fn(),
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
    max_concurrent_jobs: 4,
    provider: "codex",
    region: "us-east",
  },
];

describe("WorkersScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pullwiseApi.system.listWorkers.mockResolvedValue({ workers, items: workers });
  });

  it("lists workers returned by the admin API", async () => {
    render(<WorkersScreen />);

    expect(await screen.findByText("US-East Worker")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /^create worker$/i }));

    await waitFor(() =>
      expect(pullwiseApi.system.createWorker).toHaveBeenCalledWith(
        expect.objectContaining({ name: "New Worker" })
      )
    );
    expect(await screen.findByText("pwk_once")).toBeInTheDocument();
    expect(screen.getByText(/install-worker\.sh/)).toBeInTheDocument();
  });

  it("calls worker action endpoints", async () => {
    const user = userEvent.setup();
    pullwiseApi.system.getWorker.mockResolvedValue({ worker: workers[0], auditEvents: [] });
    pullwiseApi.system.disableWorker.mockResolvedValue({ worker: { ...workers[0], enabled: false } });
    pullwiseApi.system.enableWorker.mockResolvedValue({ worker: workers[0] });
    pullwiseApi.system.updateWorker.mockResolvedValue({ worker: workers[0] });
    pullwiseApi.system.testWorker.mockResolvedValue({ result: { ok: true } });
    pullwiseApi.system.rotateWorkerToken.mockResolvedValue({ worker_token: "pwk_rotated" });
    pullwiseApi.system.commandWorker.mockResolvedValue({ ok: true, command: { id: "cmd_1", status: "pending" } });

    render(<WorkersScreen />);

    await user.click((await screen.findByText("US-East Worker")).closest(".worker-row-main"));
    await user.click(screen.getByRole("button", { name: /stop new jobs/i }));
    await user.click(screen.getByRole("button", { name: /edit/i }));
    await user.clear(screen.getByLabelText(/region/i));
    await user.type(screen.getByLabelText(/region/i), "eu-west");
    await user.click(screen.getByRole("button", { name: /save/i }));
    await user.click(screen.getByRole("button", { name: /health check/i }));
    await user.click(screen.getByRole("button", { name: /rotate token/i }));
    await user.click(screen.getByRole("button", { name: /^stop service$/i }));
    await user.click(screen.getByRole("button", { name: /confirm stop/i }));
    await user.click(screen.getByRole("button", { name: /^delete service$/i }));
    await user.click(screen.getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => expect(pullwiseApi.system.disableWorker).toHaveBeenCalledWith("wk_1"));
    expect(pullwiseApi.system.updateWorker).toHaveBeenCalledWith("wk_1", expect.objectContaining({ region: "eu-west" }));
    expect(pullwiseApi.system.testWorker).toHaveBeenCalledWith("wk_1");
    expect(pullwiseApi.system.rotateWorkerToken).toHaveBeenCalledWith("wk_1");
    expect(pullwiseApi.system.commandWorker).toHaveBeenCalledWith("wk_1", "stop");
    expect(pullwiseApi.system.commandWorker).toHaveBeenCalledWith("wk_1", "uninstall");
    expect(await screen.findByText("pwk_rotated")).toBeInTheDocument();
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
      install_command: "curl -fsSL https://api.example.com/install-worker.sh | bash",
    });

    render(<WorkersScreen />);

    await user.click(await screen.findByRole("button", { name: /register worker/i }));
    await user.click(screen.getByRole("button", { name: /^create worker$/i }));
    const codeBlock = (await screen.findByText("Standard deployment")).closest(".code-block");
    await user.click(within(codeBlock).getByRole("button", { name: /copy/i }));

    expect(writeText).toHaveBeenCalledWith("curl -fsSL https://api.example.com/install-worker.sh | bash");
  });
});
