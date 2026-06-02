import { z } from "zod";

const absoluteUrlOrRootRelativePath = z.string().refine((value) => {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
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
