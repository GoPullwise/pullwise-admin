import { describe, expect, it } from "vitest";
import worker, { backendPath, proxyApiRequest } from "./worker.js";
import { onRequest as pagesApiOnRequest } from "./functions/api/[[path]].js";

describe("admin Cloudflare worker proxy", () => {
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
      message: "PULLWISE_API_ORIGIN must use HTTPS.",
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
      message: "PULLWISE_API_ORIGIN must use HTTPS.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
