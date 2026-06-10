import { z } from "zod";

export const DEFAULT_API_BASE_URL = "/api";

function isLoopbackHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") return true;
  const parts = normalized.split(".");
  return (
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.every((part) => {
      if (!/^\d+$/.test(part)) return false;
      const value = Number(part);
      return value >= 0 && value <= 255;
    })
  );
}

const absoluteUrlOrRootRelativePath = z.string().refine((value) => {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:") return true;
    return parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}, "Expected an absolute URL or a root-relative path.");

const envSchema = z.object({
  VITE_API_BASE_URL: absoluteUrlOrRootRelativePath.optional(),
  VITE_APP_URL: z.string().url().optional(),
});

export function parseEnv(rawEnv) {
  return envSchema.parse(rawEnv);
}

export const env = parseEnv(import.meta.env);
