import { DEFAULT_API_BASE_URL, env } from "../config/env.js";

export class ApiError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.code = typeof payload?.code === "string" ? payload.code : "";
  }
}

const DEFAULT_TIMEOUT_MS = 12000;

export const http = {
  defaults: {
    baseURL: env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL,
    timeout: DEFAULT_TIMEOUT_MS,
  },
  request: fetchRequest,
};

export async function request(path, options = {}) {
  return http.request({
    url: path,
    method: options.method || "GET",
    data: options.body,
    params: options.params,
    headers: options.headers,
    signal: options.signal,
    timeout: options.timeout,
  });
}

async function fetchRequest(config = {}) {
  const headers = { ...(config.headers || {}) };
  const body = requestBody(config.data, headers);
  const controller = new AbortController();
  const timeout = Number.isFinite(config.timeout) ? config.timeout : http.defaults.timeout;
  const timeoutId = timeout > 0 ? setTimeout(() => controller.abort(), timeout) : null;
  const abortListener = () => controller.abort();
  config.signal?.addEventListener?.("abort", abortListener, { once: true });

  try {
    const response = await fetch(buildUrl(config.url || "", config.params), {
      method: config.method || "GET",
      credentials: "include",
      headers,
      body,
      signal: controller.signal,
    });

    const payload = await responsePayload(response);
    if (!response.ok) {
      throw new ApiError(apiErrorMessage(response, payload), {
        status: response.status,
        payload,
      });
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(error?.message || "Network Error");
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    config.signal?.removeEventListener?.("abort", abortListener);
  }
}

function buildUrl(path, params) {
  const baseURL = http.defaults.baseURL || "";
  const url = /^[a-z][a-z0-9+.-]*:/i.test(path)
    ? new URL(path)
    : new URL(`${baseURL.replace(/\/$/, "")}/${String(path).replace(/^\/+/, "")}`, "http://pullwise.local");
  if (params && typeof params === "object") {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.origin === "http://pullwise.local" ? `${url.pathname}${url.search}` : url.toString();
}

function requestBody(data, headers) {
  if (data === undefined) {
    return undefined;
  }
  if (!Object.keys(headers).some((name) => name.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  const contentType = String(headers["Content-Type"] || headers["content-type"] || "").toLowerCase();
  if (contentType.includes("application/json") && typeof data !== "string") {
    return JSON.stringify(data);
  }
  return data;
}

async function responsePayload(response) {
  if (response.status === 204 || response.status === 205) {
    return null;
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return text;
}

function apiErrorMessage(response, payload) {
  if (payload && typeof payload === "object" && typeof payload.message === "string") {
    return payload.message;
  }
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  return response.statusText || `HTTP ${response.status}`;
}
