import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { backendPath, proxyApiRequest } from "./worker.js";
import { onRequest as pagesApiOnRequest } from "./functions/api/[[path]].js";

describe("admin Cloudflare worker proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps /api/admin/workers to the backend admin workers path", () => {
    expect(backendPath("/api/admin/workers")).toBe("/admin/workers");
  });

  it("returns a JSON 500 when PULLWISE_API_ORIGIN is missing", async () => {
    const response = await worker.fetch(new Request("https://admin.example.com/api/admin/workers"), {});

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "PULLWISE_API_ORIGIN is not configured.",
    });
  });

  it("proxies API requests and strips hop-by-hop headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { connection: "close", "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyApiRequest(
      new Request("https://admin.example.com/api/admin/workers", {
        headers: {
          connection: "keep-alive",
          "proxy-authorization": "secret",
        },
      }),
      { PULLWISE_API_ORIGIN: "https://api.example.com" },
      new URL("https://admin.example.com/api/admin/workers")
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://api.example.com/admin/workers"),
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
      })
    );
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.has("connection")).toBe(false);
    expect(init.headers.has("proxy-authorization")).toBe(false);
    expect(response.headers.has("connection")).toBe(false);
  });

  it("returns a controlled 502 when the Worker upstream fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("TLS failed"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyApiRequest(
      new Request("https://admin.example.com/api/auth/session"),
      { PULLWISE_API_ORIGIN: "https://api.example.com" },
      new URL("https://admin.example.com/api/auth/session")
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: "Unable to reach Pullwise API upstream.",
    });
  });

  it("returns a controlled 502 when the Pages upstream fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("connection failed"));
    vi.stubGlobal("fetch", fetchMock);

    const response = await pagesApiOnRequest({
      request: new Request("https://admin.example.com/api/auth/session"),
      env: { PULLWISE_API_ORIGIN: "https://api.example.com" },
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: "Unable to reach Pullwise API upstream.",
    });
  });

  it("allows loopback HTTP upstreams for local Worker preview", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyApiRequest(
      new Request("https://admin.example.com/api/admin/workers"),
      { PULLWISE_API_ORIGIN: "http://localhost:8080" },
      new URL("https://admin.example.com/api/admin/workers")
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(new URL("http://localhost:8080/admin/workers"), expect.any(Object));
  });

  it("allows bracketed IPv6 loopback HTTP upstreams for local Worker preview", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyApiRequest(
      new Request("https://admin.example.com/api/admin/workers"),
      { PULLWISE_API_ORIGIN: "http://[::1]:8080" },
      new URL("https://admin.example.com/api/admin/workers")
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(new URL("http://[::1]:8080/admin/workers"), expect.any(Object));
  });

  it("allows bracketed IPv6 loopback HTTP upstreams for Pages function proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    const response = await pagesApiOnRequest({
      request: new Request("https://admin.example.com/api/admin/workers"),
      env: { PULLWISE_API_ORIGIN: "http://[::1]:8080" },
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(new URL("http://[::1]:8080/admin/workers"), expect.any(Object));
  });

  it("replaces client-supplied forwarded headers before proxying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await proxyApiRequest(
      new Request("https://admin.pull-wise.com/api/auth/github/authorize", {
        headers: {
          forwarded: "proto=http;host=evil.example",
          "x-forwarded-host": "evil.example",
          "x-forwarded-prefix": "/bad",
          "x-forwarded-proto": "http",
          "x-real-ip": "203.0.113.1",
        },
      }),
      { PULLWISE_API_ORIGIN: "https://api.pull-wise.com" },
      new URL("https://admin.pull-wise.com/api/auth/github/authorize")
    );

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.get("Forwarded")).toBeNull();
    expect(headers.get("X-Real-IP")).toBeNull();
    expect(headers.get("X-Forwarded-Proto")).toBe("https");
    expect(headers.get("X-Forwarded-Host")).toBe("admin.pull-wise.com");
    expect(headers.get("X-Forwarded-Prefix")).toBeNull();
  });

  it("replaces client-supplied forwarded headers in the Pages function proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await pagesApiOnRequest({
      request: new Request("https://admin.pull-wise.com/api/auth/github/authorize", {
        headers: {
          forwarded: "proto=http;host=evil.example",
          "x-forwarded-host": "evil.example",
          "x-forwarded-prefix": "/bad",
          "x-forwarded-proto": "http",
          "x-real-ip": "203.0.113.1",
        },
      }),
      env: { PULLWISE_API_ORIGIN: "https://api.pull-wise.com" },
    });

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.get("Forwarded")).toBeNull();
    expect(headers.get("X-Real-IP")).toBeNull();
    expect(headers.get("X-Forwarded-Proto")).toBe("https");
    expect(headers.get("X-Forwarded-Host")).toBe("admin.pull-wise.com");
    expect(headers.get("X-Forwarded-Prefix")).toBeNull();
  });

  it("keeps OAuth callback Set-Cookie headers on proxied responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location: "https://admin.example.com/workers",
          "set-cookie": "pw_session=ses_1; Path=/; HttpOnly; SameSite=Lax; Secure",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyApiRequest(
      new Request("https://admin.example.com/api/auth/github/callback?state=st&code=code"),
      { PULLWISE_API_ORIGIN: "https://api.example.com" },
      new URL("https://admin.example.com/api/auth/github/callback?state=st&code=code")
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://admin.example.com/workers");
    expect(response.headers.get("set-cookie")).toContain("pw_session=ses_1");
  });

  it("rejects plaintext worker upstreams before forwarding credentials", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyApiRequest(
      new Request("https://admin.example.com/api/admin/workers", {
        headers: {
          authorization: "Bearer browser-secret",
          cookie: "sid=abc",
        },
      }),
      { PULLWISE_API_ORIGIN: "http://api.example.com" },
      new URL("https://admin.example.com/api/admin/workers")
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "PULLWISE_API_ORIGIN must use HTTPS or loopback HTTP.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects plaintext Pages function upstreams before forwarding credentials", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await pagesApiOnRequest({
      request: new Request("https://admin.example.com/api/admin/workers", {
        headers: {
          authorization: "Bearer browser-secret",
          cookie: "sid=abc",
        },
      }),
      env: { PULLWISE_API_ORIGIN: "http://api.example.com" },
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "PULLWISE_API_ORIGIN must use HTTPS or loopback HTTP.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
