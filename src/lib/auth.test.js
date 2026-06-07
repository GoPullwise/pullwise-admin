import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullwiseApi } from "../api/pullwise.js";
import {
  adminManagementRedirectUrl,
  githubAuthorizeRedirectUrl,
  signOut,
  startGitHubLogin,
} from "./auth.js";

vi.mock("../api/pullwise.js", () => ({
  pullwiseApi: {
    auth: {
      getGitHubAuthorizeUrl: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

describe("admin auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds the admin management redirect URL", () => {
    window.history.replaceState({}, "", "/login?next=dashboard");

    expect(adminManagementRedirectUrl()).toBe("http://localhost:3000/workers");
  });

  it("builds the same-origin GitHub authorize redirect URL", () => {
    expect(githubAuthorizeRedirectUrl("https://admin.pull-wise.com/workers", "/api")).toBe(
      "http://localhost:3000/api/auth/github/authorize?redirectTo=https%3A%2F%2Fadmin.pull-wise.com%2Fworkers&response=redirect"
    );
  });

  it("starts GitHub login from the login screen with the management redirect URL", async () => {
    const assign = vi.fn();
    window.history.replaceState({}, "", "/login");
    vi.stubGlobal("location", { ...window.location, assign });

    await startGitHubLogin({ apiBaseUrl: "/api" });

    expect(pullwiseApi.auth.getGitHubAuthorizeUrl).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(
      "http://localhost:3000/api/auth/github/authorize?redirectTo=http%3A%2F%2Flocalhost%3A3000%2Fworkers&response=redirect"
    );
  });

  it("starts GitHub login with an explicit redirect URL", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    await startGitHubLogin({ redirectTo: "https://admin.example.com/custom", apiBaseUrl: "/api" });

    expect(pullwiseApi.auth.getGitHubAuthorizeUrl).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(
      "http://localhost:3000/api/auth/github/authorize?redirectTo=https%3A%2F%2Fadmin.example.com%2Fcustom&response=redirect"
    );
  });

  it("signs out and returns to the login screen", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    pullwiseApi.auth.signOut.mockResolvedValue({});

    await signOut();

    expect(pullwiseApi.auth.signOut).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("returns to the login screen even when sign-out API fails", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    pullwiseApi.auth.signOut.mockRejectedValue(new Error("offline"));

    await signOut();

    expect(pullwiseApi.auth.signOut).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/login");
  });
});
