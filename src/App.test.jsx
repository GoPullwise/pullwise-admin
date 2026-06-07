import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullwiseApi } from "./api/pullwise.js";
import { App } from "./App.jsx";
import { startGitHubLogin } from "./lib/auth.js";

vi.mock("./api/pullwise.js", () => ({
  pullwiseApi: {
    auth: {
      getSession: vi.fn(),
    },
    system: {
      listWorkers: vi.fn(),
    },
  },
}));

vi.mock("./lib/auth.js", () => ({
  startGitHubLogin: vi.fn(),
  signOut: vi.fn(),
}));

describe("Admin App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pullwiseApi.auth.getSession.mockResolvedValue({ authenticated: false });
    pullwiseApi.system.listWorkers.mockResolvedValue({ workers: [] });
  });

  it("shows GitHub login for unauthenticated users", async () => {
    const { container } = render(<App />);

    expect(await screen.findByRole("button", { name: /continue with github/i })).toBeInTheDocument();
    const brandMark = container.querySelector(".brand-mark");
    expect(brandMark?.tagName).toBe("IMG");
    expect(brandMark).toHaveAttribute("src", "/favicon.ico");
    expect(brandMark).not.toHaveTextContent("PW");
  });

  it("starts GitHub login from the login screen", async () => {
    const user = userEvent.setup();
    startGitHubLogin.mockResolvedValueOnce(undefined);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /continue with github/i }));

    await waitFor(() => expect(startGitHubLogin).toHaveBeenCalledTimes(1));
  });

  it("blocks authenticated users who are not admins", async () => {
    pullwiseApi.auth.getSession.mockResolvedValueOnce({
      authenticated: true,
      admin: false,
      user: { email: "dev@example.com" },
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: /admin access required/i })).toBeInTheDocument();
    expect(screen.queryByText(/worker registry/i)).not.toBeInTheDocument();
  });

  it("renders workers dashboard for authenticated admins", async () => {
    pullwiseApi.auth.getSession.mockResolvedValueOnce({
      authenticated: true,
      admin: true,
      user: { email: "admin@example.com" },
    });
    pullwiseApi.system.listWorkers.mockResolvedValueOnce({
      workers: [{ worker_id: "wk_1", name: "Admin Worker", status: "idle", enabled: true }],
    });

    render(<App />);

    expect(await screen.findByText("Worker Registry")).toBeInTheDocument();
    expect(await screen.findByText("Admin Worker")).toBeInTheDocument();
  });
});
