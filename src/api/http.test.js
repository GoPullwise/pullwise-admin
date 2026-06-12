import { afterEach, describe, expect, it, vi } from "vitest";
import { githubAuthorizeRedirectUrl } from "../lib/auth.js";
import { http, request } from "./http.js";

const originalWindow = globalThis.window;

describe("request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it("uses the same default API base path for XHR and GitHub authorize redirects", () => {
    globalThis.window = { location: { origin: "http://localhost:3000" } };

    expect(http.defaults.baseURL).toBe("/api");
    expect(githubAuthorizeRedirectUrl("http://localhost:3000/workers", "http://localhost:3000/api")).toMatch(
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
