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
      listUsers: vi.fn(),
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
    pullwiseApi.system.listUsers.mockResolvedValue({ users: [] });
    window.history.pushState({}, "", "/workers");
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

  it("shows a session error instead of the login screen when session check fails", async () => {
    pullwiseApi.auth.getSession.mockRejectedValueOnce(new Error("server down"));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("server down");
    expect(screen.queryByRole("button", { name: /continue with github/i })).not.toBeInTheDocument();
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

  it("renders user management for authenticated admins on the users route", async () => {
    window.history.pushState({}, "", "/users");
    pullwiseApi.auth.getSession.mockResolvedValueOnce({
      authenticated: true,
      admin: true,
      user: { email: "admin@example.com" },
    });
    pullwiseApi.system.listUsers.mockResolvedValueOnce({
      users: [{ id: "usr_1", name: "Authorized User", email: "user@example.com", scanCount: 2 }],
    });

    render(<App />);

    expect(await screen.findByText("User Management")).toBeInTheDocument();
    expect(await screen.findByText("Authorized User")).toBeInTheDocument();
  });
});
