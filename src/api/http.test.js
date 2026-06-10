import { afterEach, describe, expect, it, vi } from "vitest";
import { githubAuthorizeRedirectUrl } from "../lib/auth.js";
import { http, request } from "./http.js";

describe("request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the same default API base path for XHR and GitHub authorize redirects", () => {
    expect(http.defaults.baseURL).toBe("/api");
    expect(githubAuthorizeRedirectUrl("http://localhost:3000/workers")).toMatch(
      /^http:\/\/localhost:3000\/api\/auth\/github\/authorize\?/
    );
  });

  it("does not send a JSON content type for bodyless GET requests", async () => {
    const httpRequest = vi.spyOn(http, "request").mockResolvedValue({ data: { ok: true } });

    await request("/auth/session");

    expect(httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/auth/session",
        method: "GET",
        headers: {},
      })
    );
  });

  it("sends a JSON content type when the request has a body", async () => {
    const httpRequest = vi.spyOn(http, "request").mockResolvedValue({ data: { ok: true } });

    await request("/admin/workers", { method: "POST", body: { name: "Admin worker" } });

    expect(httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/admin/workers",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
  });
});
