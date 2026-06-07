# pullwise-admin

Separate Pullwise admin frontend for worker management.

The admin app has one flow:

1. Sign in with GitHub through the Pullwise server.
2. Read `/auth/session`.
3. Enter the workers dashboard only when the session is authenticated and `admin: true`.
4. Manage workers through the existing `/admin/workers*` server endpoints.

The app does not store GitHub OAuth secrets or the admin allowlist. Those stay on
`pullwise-server`.

## Local Development

```bash
npm install
npm run dev
```

Local defaults:

```bash
VITE_APP_URL=http://localhost:5174
VITE_API_BASE_URL=http://localhost:8080
```

Plaintext `http://` API origins are accepted only for localhost or loopback
development addresses. Use `/api` or an `https://` API origin for deployed
admin builds.

## Cloudflare Workers Deployment

For the current custom admin URL, use same-origin API proxying through the
admin Worker:

```bash
# .env.production
VITE_APP_URL=https://admin.pull-wise.com
VITE_API_BASE_URL=/api
```

Configure the Worker runtime upstream separately in `wrangler.jsonc` or as a
Cloudflare Worker variable:

```bash
PULLWISE_API_ORIGIN=https://api.pull-wise.com
```

For this proxy mode, configure `pullwise-server` to trust the admin Worker's
forwarded headers and include the admin origin:

```bash
PULLWISE_ALLOWED_ORIGINS=https://pull-wise.com,https://admin.pull-wise.com
PULLWISE_TRUST_PROXY_HEADERS=true
PULLWISE_COOKIE_SECURE=true
PULLWISE_COOKIE_SAME_SITE=Lax
```

The server should derive the OAuth callback from `X-Forwarded-*` headers:

```text
https://admin.pull-wise.com/api/auth/github/callback
```

The login button starts OAuth with a browser navigation to the same-origin
`/api/auth/github/authorize?response=redirect` endpoint. This avoids XHR-only
Cloudflare challenge failures on the OAuth start request.

`PULLWISE_API_ORIGIN` is read by `worker.js` or `functions/api/[[path]].js` at
runtime. It is not browser-exposed Vite config.

## Server Configuration

Admin authorization remains server-side:

```bash
PULLWISE_ADMIN_EMAILS=admin@example.com
PULLWISE_ADMIN_USER_IDS=
```

When deploying this admin domain, add the exact admin origin to the server's
allowed origins:

```bash
PULLWISE_ALLOWED_ORIGINS=https://pull-wise.com,https://admin.pull-wise.com
```
