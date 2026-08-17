#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";

const REPOSITORY = "admin";
const START_MARKER = "<!-- PULLWISE_REVIEWER_CURRENT_AUTHORITY_START -->";
const END_MARKER = "<!-- PULLWISE_REVIEWER_CURRENT_AUTHORITY_END -->";
const REQUIRED_URLS = [
  "https://app.notion.com/p/3b4e5c88f85f8128bd39dac3a7679c4a",
  "https://app.notion.com/p/3b4e5c88f85f818e933ecf3864c97469",
  "https://app.notion.com/p/b79ceacfedcd4d34a0d619c1790066c4",
  "https://app.notion.com/p/760a1698a86b404083662eeb1b637f64",
  "https://app.notion.com/p/3b5e5c88f85f81bc840ace8b8a65962e",
  "https://app.notion.com/p/3b5e5c88f85f81aeaeaef4621d211126",
  "https://app.notion.com/p/3b5e5c88f85f81d89deef714c8b23eeb",
  "https://app.notion.com/p/3b8e5c88f85f814d8296c6c60541946d",
  "https://app.notion.com/p/3b4e5c88f85f8192a488f6db72fa116b",
];
const CURRENT_ROUTING_SHA256 = "9928a40c0cd22d15e3d8c9278b2ef15bcc83de6a015f55a68452c76f8a82e5c4";

function report(status, errors, sha256 = null) {
  return {
    schema_id: "pullwise-current-reviewer-ci-authority-report/v1",
    repository: REPOSITORY,
    status,
    path: "AGENTS.md",
    errors,
    sha256,
  };
}

function validate() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const agentsPath = path.join(root, "AGENTS.md");
  let metadata;
  try {
    metadata = fs.lstatSync(agentsPath);
  } catch {
    return report("INDETERMINATE", ["agents_file_unreadable"]);
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    return report("INDETERMINATE", ["agents_file_not_regular"]);
  }

  let raw;
  let text;
  try {
    raw = fs.readFileSync(agentsPath);
    text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return report("INDETERMINATE", ["agents_file_not_utf8"]);
  }

  const normalized = text.replace(/\r\n?/g, "\n");
  const errors = [];
  if (!normalized.startsWith(START_MARKER + "\n")) {
    errors.push("missing_current_authority_block");
  }
  const end = normalized.indexOf(END_MARKER);
  if (end < 0) {
    errors.push("unterminated_current_authority_block");
  } else {
    const block = normalized.slice(0, end + END_MARKER.length);
    for (const url of REQUIRED_URLS) {
      if (!block.includes(url)) errors.push("required_reference_missing");
    }
    const blockSha256 = crypto.createHash("sha256").update(block, "utf8").digest("hex");
    if (blockSha256 !== CURRENT_ROUTING_SHA256) {
      errors.push("contradictory_block");
    }
  }
  return report(
    errors.length ? "FAIL" : "PASS",
    [...new Set(errors)].sort(),
    crypto.createHash("sha256").update(raw).digest("hex"),
  );
}

const result = validate();
process.stdout.write(JSON.stringify(result) + "\n");
process.exitCode = result.status === "PASS" ? 0 : result.status === "FAIL" ? 1 : 2;
