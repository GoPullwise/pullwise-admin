import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullwiseApi } from "../api/pullwise.js";
import {
  adminManagementRedirectUrl,
  crossOriginGitHubAuthorizeUrl,
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

  it("builds a redirecting authorize URL for a cross-origin API", () => {
    expect(
      crossOriginGitHubAuthorizeUrl(
        "https://admin.example.com/workers",
        "https://api.pull-wise.com"
      )
    ).toBe(
      "https://api.pull-wise.com/auth/github/authorize?redirectTo=https%3A%2F%2Fadmin.example.com%2Fworkers&response=redirect"
    );
  });

  it("keeps same-origin API proxy login on the JSON authorize flow", () => {
    expect(crossOriginGitHubAuthorizeUrl("http://localhost:3000/workers", "/api")).toBe("");
  });

  it("starts GitHub login from the login screen with the management redirect URL", async () => {
    const assign = vi.fn();
    window.history.replaceState({}, "", "/login");
    vi.stubGlobal("location", { ...window.location, assign });
    pullwiseApi.auth.getGitHubAuthorizeUrl.mockResolvedValue({
      url: "https://github.com/login/oauth/authorize?client_id=pw",
    });

    await startGitHubLogin();

    expect(pullwiseApi.auth.getGitHubAuthorizeUrl).toHaveBeenCalledWith(
      { redirectTo: "http://localhost:3000/workers" },
      {}
    );
    expect(assign).toHaveBeenCalledWith("https://github.com/login/oauth/authorize?client_id=pw");
  });

  it("starts GitHub login with an explicit redirect URL", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    pullwiseApi.auth.getGitHubAuthorizeUrl.mockResolvedValue({
      url: "https://github.com/login/oauth/authorize?client_id=pw",
    });

    await startGitHubLogin({ redirectTo: "https://admin.example.com/custom" });

    expect(pullwiseApi.auth.getGitHubAuthorizeUrl).toHaveBeenCalledWith(
      { redirectTo: "https://admin.example.com/custom" },
      {}
    );
    expect(assign).toHaveBeenCalledWith("https://github.com/login/oauth/authorize?client_id=pw");
  });

  it("throws when the backend does not return an authorize URL", async () => {
    pullwiseApi.auth.getGitHubAuthorizeUrl.mockResolvedValue({});

    await expect(startGitHubLogin()).rejects.toThrow(/authorize url is missing/i);
  });

  it("rejects non-GitHub authorize URLs without navigating", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    pullwiseApi.auth.getGitHubAuthorizeUrl.mockResolvedValue({
      url: "https://evil.example/phish",
    });

    await expect(startGitHubLogin()).rejects.toThrow(/trusted GitHub authorize URL/i);

    expect(assign).not.toHaveBeenCalled();
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
