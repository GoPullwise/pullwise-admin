import { request } from "./http.js";

function withSearchParams(path, params = {}) {
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
  const search = new URLSearchParams(cleanParams).toString();
  return search ? `${path}?${search}` : path;
}

function pathSegment(value) {
  const text = String(value ?? "");
  if (!text) throw new Error("API path segment is required.");
  return encodeURIComponent(text);
}

export const pullwiseApi = {
  auth: {
    getSession: (options = {}) => request("/auth/session", { signal: options.signal }),
    signOut: (options = {}) => request("/auth/sign-out", { method: "POST", signal: options.signal }),
    getGitHubAuthorizeUrl: (params = {}, options = {}) =>
      request(withSearchParams("/auth/github/authorize", params), { signal: options.signal }),
  },
  system: {
    listWorkers: () => request("/admin/workers"),
    getWorkerDefaults: () => request("/admin/workers/defaults"),
    createWorker: (payload = {}) => request("/admin/workers", { method: "POST", body: payload }),
    getWorker: (workerId) => request(`/admin/workers/${pathSegment(workerId)}`),
    updateWorker: (workerId, payload = {}) =>
      request(`/admin/workers/${pathSegment(workerId)}`, { method: "PATCH", body: payload }),
    enableWorker: (workerId) =>
      request(`/admin/workers/${pathSegment(workerId)}/enable`, { method: "POST" }),
    disableWorker: (workerId) =>
      request(`/admin/workers/${pathSegment(workerId)}/disable`, { method: "POST" }),
    commandWorker: (workerId, command) =>
      request(`/admin/workers/${pathSegment(workerId)}/commands`, { method: "POST", body: { command } }),
    rotateWorkerToken: (workerId) =>
      request(`/admin/workers/${pathSegment(workerId)}/rotate-token`, { method: "POST" }),
    testWorker: (workerId) =>
      request(`/admin/workers/${pathSegment(workerId)}/test`, { method: "POST" }),
    deleteWorker: (workerId) =>
      request(`/admin/workers/${pathSegment(workerId)}`, { method: "DELETE" }),
    getSystemConfig: () => request("/admin/system-config"),
    updateSystemConfig: (payload = {}) =>
      request("/admin/system-config", { method: "PATCH", body: payload }),
    listPlanAgentConfigs: () => request("/admin/subscription-plans/agent-configs"),
    updatePlanAgentConfig: (planId, payload = {}) =>
      request(`/admin/subscription-plans/agent-configs/${pathSegment(planId)}`, { method: "PATCH", body: payload }),
    listUsers: () => request("/admin/users"),
    deleteUser: (userId) =>
      request(`/admin/users/${pathSegment(userId)}`, { method: "DELETE" }),
  },
};
