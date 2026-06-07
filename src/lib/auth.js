import { pullwiseApi } from "../api/pullwise.js";

export const ADMIN_MANAGEMENT_PATH = "/workers";

export function adminManagementRedirectUrl() {
  return new URL(ADMIN_MANAGEMENT_PATH, window.location.href).toString();
}

function safeHttpUrl(value, label) {
  if (typeof value !== "string") throw new Error(`A safe ${label} is required.`);
  const url = value.trim();
  if ([...url].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new Error(`A safe ${label} is required.`);
  }
  try {
    const parsed = new URL(url);
    if (["http:", "https:"].includes(parsed.protocol) && parsed.hostname) return url;
  } catch {
    // handled below
  }
  throw new Error(`A safe ${label} is required.`);
}

function safeGitHubAuthorizeUrl(value) {
  const url = safeHttpUrl(value, "GitHub authorize URL");
  const parsed = new URL(url);
  if (
    parsed.protocol === "https:" &&
    parsed.hostname.toLowerCase() === "github.com" &&
    parsed.pathname === "/login/oauth/authorize"
  ) {
    return url;
  }
  throw new Error("A trusted GitHub authorize URL is required.");
}

export async function startGitHubLogin({ redirectTo, signal } = {}) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  const result = await pullwiseApi.auth.getGitHubAuthorizeUrl(
    { redirectTo: redirectTo || adminManagementRedirectUrl() },
    signal ? { signal } : {}
  );
  if (signal?.aborted) return;
  if (!result?.url) {
    throw new Error("GitHub authorize URL is missing from the auth response.");
  }
  window.location.assign(safeGitHubAuthorizeUrl(result.url));
}

export async function signOut() {
  try {
    await pullwiseApi.auth.signOut();
  } catch {
    // Local navigation must still happen when the server-side logout request fails.
  } finally {
    window.location.assign("/login");
  }
}
