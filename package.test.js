import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
const packageLock = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf-8"));

describe("admin deployment tooling", () => {
  it("pins wrangler in the project dependency graph and uses the local binary", () => {
    expect(packageJson.devDependencies.wrangler).toBeTruthy();
    expect(packageLock.packages[""].devDependencies.wrangler).toBe(packageJson.devDependencies.wrangler);
    expect(packageLock.packages["node_modules/wrangler"]).toBeTruthy();
    expect(packageJson.scripts["preview:workers"]).toBe("npm run build && wrangler dev");
    expect(packageJson.scripts["deploy:workers"]).toBe("npm run build && wrangler deploy");
  });
});
