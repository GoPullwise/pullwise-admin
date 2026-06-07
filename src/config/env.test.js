import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.js";

describe("parseEnv", () => {
  it("accepts a root-relative API base URL for same-origin Cloudflare proxying", () => {
    expect(parseEnv({ VITE_API_BASE_URL: "/api" }).VITE_API_BASE_URL).toBe("/api");
  });

  it("accepts an absolute API base URL for cross-origin admin deployments", () => {
    expect(parseEnv({ VITE_API_BASE_URL: "https://api.pull-wise.com" }).VITE_API_BASE_URL).toBe(
      "https://api.pull-wise.com"
    );
  });

  it("rejects unsafe API base URLs", () => {
    expect(() => parseEnv({ VITE_API_BASE_URL: "javascript:alert(1)" })).toThrow(
      /absolute URL or a root-relative path/i
    );
  });
});
