import { beforeEach, describe, expect, it, vi } from "vitest";
import { pullwiseApi } from "../api/pullwise.js";
import { signOut, startGitHubLogin } from "./auth.js";

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

  it("starts GitHub login with an admin redirect URL", async () => {
    const assign = vi.fn();
    window.history.replaceState({}, "", "/workers");
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

  it("throws when the backend does not return an authorize URL", async () => {
    pullwiseApi.auth.getGitHubAuthorizeUrl.mockResolvedValue({});

    await expect(startGitHubLogin()).rejects.toThrow(/authorize url is missing/i);
  });

  it("signs out and returns to the login screen", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    pullwiseApi.auth.signOut.mockResolvedValue({});

    await signOut();

    expect(pullwiseApi.auth.signOut).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/login");
  });
});
