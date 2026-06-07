export async function onRequest(context) {
  const origin = context.env.PULLWISE_API_ORIGIN;
  if (!origin) {
    return json({ message: "PULLWISE_API_ORIGIN is not configured." }, 500);
  }
  const upstreamOrigin = apiOrigin(origin);
  if (!upstreamOrigin) {
    return json({ message: "PULLWISE_API_ORIGIN must use HTTPS." }, 500);
  }

  const incomingUrl = new URL(context.request.url);
  const targetUrl = new URL(backendPath(incomingUrl) + incomingUrl.search, upstreamOrigin);
  const headers = withoutHopByHopHeaders(context.request.headers);
  headers.delete("host");
  headers.set("X-Forwarded-Proto", incomingUrl.protocol.replace(":", ""));
  headers.set("X-Forwarded-Host", incomingUrl.host);
  headers.set("X-Forwarded-Prefix", "/api");
  const methodHasBody = hasBody(context.request.method);

  const response = await fetch(targetUrl, {
    method: context.request.method,
    headers,
    body: methodHasBody ? context.request.body : undefined,
    duplex: methodHasBody ? "half" : undefined,
    redirect: "manual",
  });

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
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
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

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
