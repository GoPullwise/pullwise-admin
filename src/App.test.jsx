import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullwiseApi } from "./api/pullwise.js";
import { App } from "./App.jsx";

vi.mock("./api/pullwise.js", () => ({
  pullwiseApi: {
    auth: {
      getSession: vi.fn(),
    },
    system: {
      listWorkers: vi.fn(),
      listUsers: vi.fn(),
      listPlanAgentConfigs: vi.fn(),
      updatePlanAgentConfig: vi.fn(),
      getSystemConfig: vi.fn(),
      updateSystemConfig: vi.fn(),
    },
  },
}));

describe("Admin App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pullwiseApi.auth.getSession.mockResolvedValue({ authenticated: false });
    pullwiseApi.system.listWorkers.mockResolvedValue({ workers: [] });
    pullwiseApi.system.listUsers.mockResolvedValue({ users: [] });
    pullwiseApi.system.listPlanAgentConfigs.mockResolvedValue({ plans: [] });
    pullwiseApi.system.getSystemConfig.mockResolvedValue({ settings: {}, groups: [] });
    window.history.pushState({}, "", "/workers");
  });

  it("shows GitHub login for unauthenticated users", async () => {
    const { container } = render(<App />);

    expect(await screen.findByRole("link", { name: /continue with github/i })).toBeInTheDocument();
    const brandMark = container.querySelector(".brand-mark");
    expect(brandMark?.tagName).toBe("IMG");
    expect(brandMark).toHaveAttribute("src", "/favicon.ico");
    expect(brandMark).not.toHaveTextContent("PW");
  });

  it("shows GitHub callback errors on the login screen", async () => {
    window.history.pushState({}, "", "/workers?github_error=redirect_uri_mismatch");

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("redirect_uri_mismatch");
  });

  it("exposes a native GitHub authorize link from the login screen", async () => {
    render(<App />);

    expect(await screen.findByRole("link", { name: /continue with github/i })).toHaveAttribute(
      "href",
      "http://localhost:3000/api/auth/github/authorize?redirectTo=http%3A%2F%2Flocalhost%3A3000%2Fworkers&response=redirect"
    );
  });

  it("shows a session error instead of the login screen when session check fails", async () => {
    pullwiseApi.auth.getSession.mockRejectedValueOnce(new Error("server down"));

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("server down");
    expect(screen.queryByRole("link", { name: /continue with github/i })).not.toBeInTheDocument();
  });

  it("keeps the GitHub sign-in entry available on the login route when session check fails", async () => {
    window.history.pushState({}, "", "/login");
    pullwiseApi.auth.getSession.mockRejectedValueOnce(new Error("server down"));

    render(<App />);

    expect(await screen.findByRole("link", { name: /continue with github/i })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("server down");
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

  it("keeps the login route on the login screen even when the old admin session is still valid", async () => {
    window.history.pushState({}, "", "/login");
    pullwiseApi.auth.getSession.mockResolvedValueOnce({
      authenticated: true,
      admin: true,
      user: { email: "admin@example.com" },
    });

    render(<App />);

    expect(await screen.findByRole("link", { name: /continue with github/i })).toBeInTheDocument();
    expect(screen.queryByText(/worker registry/i)).not.toBeInTheDocument();
    expect(pullwiseApi.system.listWorkers).not.toHaveBeenCalled();
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

  it("renders plan agent config management for authenticated admins on the plans route", async () => {
    window.history.pushState({}, "", "/plans");
    pullwiseApi.auth.getSession.mockResolvedValueOnce({
      authenticated: true,
      admin: true,
      user: { email: "admin@example.com" },
    });
    pullwiseApi.system.listPlanAgentConfigs.mockResolvedValueOnce({
      plans: [
        {
          id: "pro",
          name: "Pro",
          reviewLimit: 60,
          agentConfig: {
            plan: "pro",
            provider: "codex",
            codex: { cli: "codex", command: "codex", model: "gpt-5.5", reasoningEffort: "medium" },
          },
        },
      ],
    });

    render(<App />);

    expect(await screen.findByText("Plan Agent Configs")).toBeInTheDocument();
    expect(await screen.findByText("Pro")).toBeInTheDocument();
  });
});
