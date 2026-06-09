const API_PREFIX = "/api";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isApiRequest(url)) {
      return proxyApiRequest(request, env, url);
    }
    if (!env.ASSETS) {
      return json({ message: "Static assets binding is not configured." }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};

export async function proxyApiRequest(request, env, incomingUrl = new URL(request.url)) {
  const origin = env.PULLWISE_API_ORIGIN;
  if (!origin) {
    return json({ message: "PULLWISE_API_ORIGIN is not configured." }, 500);
  }
  const upstreamOrigin = apiOrigin(origin);
  if (!upstreamOrigin) {
    return json({ message: "PULLWISE_API_ORIGIN must use HTTPS or loopback HTTP." }, 500);
  }

  const targetUrl = new URL(backendPath(incomingUrl.pathname) + incomingUrl.search, upstreamOrigin);
  const headers = withoutClientProxyHeaders(request.headers);
  headers.set("X-Forwarded-Proto", incomingUrl.protocol.replace(":", ""));
  headers.set("X-Forwarded-Host", incomingUrl.host);
  headers.set("X-Forwarded-Prefix", API_PREFIX);

  const methodHasBody = hasBody(request.method);
  const init = {
    method: request.method,
    headers,
    body: methodHasBody ? request.body : undefined,
    redirect: "manual",
  };
  if (methodHasBody) {
    init.duplex = "half";
  }

  let response;
  try {
    response = await fetch(targetUrl, init);
  } catch {
    return json({ message: "Unable to reach Pullwise API upstream." }, 502);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: withoutHopByHopHeaders(response.headers),
  });
}

export function isApiRequest(url) {
  return url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`);
}

export function backendPath(pathname) {
  const stripped = pathname.replace(/^\/api/, "");
  if (!stripped || stripped === "/") return "/";
  return `/${stripped.replace(/^\/+/, "")}`;
}

function apiOrigin(origin) {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === "https:") return parsed;
    if (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function hasBody(method) {
  return !["GET", "HEAD"].includes(method.toUpperCase());
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const CLIENT_PROXY_HEADERS = new Set([
  "cf-connecting-ip",
  "cf-connecting-ipv6",
  "client-ip",
  "fastly-client-ip",
  "forwarded",
  "real-ip",
  "true-client-ip",
  "x-client-ip",
  "x-cluster-client-ip",
  "x-original-forwarded-for",
  "x-real-ip",
]);

function withoutHopByHopHeaders(sourceHeaders) {
  const headers = new Headers(sourceHeaders);
  const connectionTokens = headers
    .get("connection")
    ?.split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  for (const name of HOP_BY_HOP_HEADERS) {
    headers.delete(name);
  }
  for (const name of connectionTokens || []) {
    headers.delete(name);
  }
  return headers;
}

function withoutClientProxyHeaders(sourceHeaders) {
  const headers = withoutHopByHopHeaders(sourceHeaders);
  headers.delete("host");
  for (const name of [...headers.keys()]) {
    const lowerName = name.toLowerCase();
    if (lowerName.startsWith("x-forwarded-") || CLIENT_PROXY_HEADERS.has(lowerName)) {
      headers.delete(name);
    }
  }
  return headers;
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
