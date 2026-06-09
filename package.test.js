import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
const packageLock = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf-8"));
const wrangler = JSON.parse(readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf-8"));

describe("admin deployment tooling", () => {
  it("pins wrangler in the project dependency graph and uses the local binary", () => {
    expect(packageJson.devDependencies.wrangler).toBeTruthy();
    expect(packageLock.packages[""].devDependencies.wrangler).toBe(packageJson.devDependencies.wrangler);
    expect(packageLock.packages["node_modules/wrangler"]).toBeTruthy();
    expect(packageJson.scripts["preview:workers"]).toContain("wrangler dev");
    expect(packageJson.scripts["preview:workers"]).toContain("PULLWISE_API_ORIGIN:http://localhost:8080");
    expect(packageJson.scripts["deploy:workers"]).toBe("npm run build && wrangler deploy");
  });

  it("configures the deployed Worker proxy upstream while local preview overrides it", () => {
    expect(wrangler.vars?.PULLWISE_API_ORIGIN).toBe("https://api.pull-wise.com");
    expect(packageJson.scripts["preview:workers"]).not.toContain("https://api.pull-wise.com");
  });

  it("binds Workers static assets for the admin SPA", () => {
    expect(wrangler.assets).toEqual(
      expect.objectContaining({
        directory: "./dist",
        binding: "ASSETS",
        not_found_handling: "single-page-application",
      })
    );
  });

  it("routes API requests through the Worker before the SPA assets fallback", () => {
    expect(Array.isArray(wrangler.assets?.run_worker_first)).toBe(true);
    expect(wrangler.assets?.run_worker_first).toContain("/api/*");
  });
});
