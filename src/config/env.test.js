import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.js";

describe("parseEnv", () => {
  it("accepts a root-relative API base URL for same-origin Cloudflare proxying", () => {
    expect(parseEnv({ VITE_API_BASE_URL: "/api" }).VITE_API_BASE_URL).toBe("/api");
  });

  it("rejects unsafe API base URLs", () => {
    expect(() => parseEnv({ VITE_API_BASE_URL: "javascript:alert(1)" })).toThrow(
      /absolute URL or a root-relative path/i
    );
  });
});
