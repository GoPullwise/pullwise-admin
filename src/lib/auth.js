import { pullwiseApi } from "../api/pullwise.js";
import { env } from "../config/env.js";

export const ADMIN_MANAGEMENT_PATH = "/workers";
const GITHUB_AUTHORIZE_PATH = "/auth/github/authorize";

export function adminManagementRedirectUrl() {
  return new URL(ADMIN_MANAGEMENT_PATH, window.location.href).toString();
}

export function githubAuthorizeRedirectUrl(redirectTo, apiBaseUrl = env.VITE_API_BASE_URL || "/api") {
  const base = new URL(apiBaseUrl || "/", window.location.origin);
  const prefix = base.pathname.replace(/\/$/, "");
  const url = new URL(`${prefix}${GITHUB_AUTHORIZE_PATH}`, base.origin);
  url.searchParams.set("redirectTo", redirectTo);
  url.searchParams.set("response", "redirect");
  return url.toString();
}

export async function startGitHubLogin({ redirectTo, signal, apiBaseUrl } = {}) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  const target = redirectTo || adminManagementRedirectUrl();
  window.location.assign(githubAuthorizeRedirectUrl(target, apiBaseUrl));
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
