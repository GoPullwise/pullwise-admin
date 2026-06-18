import { afterEach, describe, expect, it, vi } from "vitest";
import { githubAuthorizeRedirectUrl } from "../lib/auth.js";
import { http, request } from "./http.js";

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

describe("request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
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
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      })
    );
    globalThis.fetch = fetchMock;

    await request("/auth/session");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: {},
      })
    );
  });

  it("sends a JSON content type when the request has a body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      })
    );
    globalThis.fetch = fetchMock;

    await request("/admin/workers", { method: "POST", body: { name: "Admin worker" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/workers",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Admin worker" }),
      })
    );
  });

  it("surfaces structured API errors from non-2xx responses", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Admin access is required.", code: "ADMIN_REQUIRED" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(request("/admin/workers")).rejects.toMatchObject({
      name: "ApiError",
      message: "Admin access is required.",
      status: 403,
      payload: { message: "Admin access is required.", code: "ADMIN_REQUIRED" },
      code: "ADMIN_REQUIRED",
    });
  });
});
