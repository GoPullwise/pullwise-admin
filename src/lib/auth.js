import { pullwiseApi } from "../api/pullwise.js";

function currentRedirectUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  return url.toString();
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

export async function startGitHubLogin({ redirectTo, signal } = {}) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  const result = await pullwiseApi.auth.getGitHubAuthorizeUrl(
    { redirectTo: redirectTo || currentRedirectUrl() },
    signal ? { signal } : {}
  );
  if (signal?.aborted) return;
  if (!result?.url) {
    throw new Error("GitHub authorize URL is missing from the auth response.");
  }
  window.location.assign(safeHttpUrl(result.url, "GitHub authorize URL"));
}

export async function signOut() {
  await pullwiseApi.auth.signOut();
  window.location.assign("/login");
}
