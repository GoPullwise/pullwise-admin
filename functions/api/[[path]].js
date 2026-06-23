
export async function onRequest(context) {
  const origin = context.env.PULLWISE_API_ORIGIN;
  if (!origin) {
    return json({ message: "PULLWISE_API_ORIGIN is not configured." }, 500);
  }
  const upstreamOrigin = apiOrigin(origin);
  if (!upstreamOrigin) {
    return json({ message: "PULLWISE_API_ORIGIN must use HTTPS or loopback HTTP." }, 500);
  }

  const incomingUrl = new URL(context.request.url);
  const backendPathWithSearch = backendPath(incomingUrl) + incomingUrl.search;
  const targetUrl = new URL(backendPathWithSearch, upstreamOrigin);
  const headers = withoutClientProxyHeaders(context.request.headers);
  headers.set("X-Forwarded-Proto", incomingUrl.protocol.replace(":", ""));
  headers.set("X-Forwarded-Host", incomingUrl.host);
  const methodHasBody = hasBody(context.request.method);
  const bufferedBody = methodHasBody ? await context.request.clone().arrayBuffer() : undefined;

  const init = {
    method: context.request.method,
    headers,
    body: bufferedBody,
    duplex: methodHasBody ? "half" : undefined,
    redirect: "manual",
  };
  let response = await fetchUpstream(targetUrl, init);
  if (await shouldRetryCloudflare1003(response, upstreamOrigin, context.env)) {
    const fallbackOrigin = apiOrigin(context.env.PULLWISE_API_FALLBACK_ORIGIN || "");
    response = await fetchUpstream(new URL(backendPathWithSearch, fallbackOrigin), init);
  }

  return proxyResponse(response);
}

async function fetchUpstream(targetUrl, init) {
  try {
    return await fetch(targetUrl, init);
  } catch {
    return json({ message: "Unable to reach Pullwise API upstream." }, 502);
  }
}

function proxyResponse(response) {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: withoutHopByHopHeaders(response.headers),
  });
}

function backendPath(incomingUrl) {
  const stripped = incomingUrl.pathname.replace(/^\/api/, "");
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
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return ["localhost", "127.0.0.1", "::1"].includes(normalized);
}

async function shouldRetryCloudflare1003(response, upstreamOrigin, env) {
  if (response.status !== 403) return false;
  const fallbackOrigin = apiOrigin(env.PULLWISE_API_FALLBACK_ORIGIN || "");
  if (!fallbackOrigin || fallbackOrigin.origin === upstreamOrigin.origin) return false;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return false;
  try {
    return (await response.clone().text()).includes("error code: 1003");
  } catch {
    return false;
  }
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
