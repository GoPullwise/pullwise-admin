import { describe, expect, it } from "vitest";
import { pullwiseApi } from "./pullwise.js";

describe("pullwiseApi system operations", () => {
  it("does not expose direct server restart capability", () => {
    expect(pullwiseApi.system).not.toHaveProperty("restartServer");
  });
});
