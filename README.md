# pullwise-admin

Separate Pullwise admin frontend for Pullwise operations.

The admin app signs in through the Pullwise server, reads `/auth/session`, and
only enters the console when the session is authenticated with `admin: true`.
It currently includes worker management, worker release/defaults, plan and agent
policy settings, general system configuration, user administration, server
metrics, server restart, and server/worker log streams through existing
`/admin/*` server endpoints.

The app does not store GitHub OAuth secrets, billing secrets, SMTP passwords, or
the admin allowlist. Those stay on `pullwise-server`.

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
# Optional read-only fallback for Cloudflare 1003 responses on GET/HEAD requests
# without cookies, Authorization, or X-Pullwise-Api-Key.
PULLWISE_API_FALLBACK_ORIGIN=https://api-fallback.pull-wise.com
```

For this proxy mode, keep `/api` as a browser-facing admin Worker prefix only.
Configure `pullwise-server` with the public API origin, not the admin proxy
path:

```bash
PULLWISE_API_BASE_URL=https://api.pull-wise.com
PULLWISE_ALLOWED_ORIGINS=https://pull-wise.com,https://admin.pull-wise.com
PULLWISE_COOKIE_SECURE=true
PULLWISE_COOKIE_SAME_SITE=Lax
```

The OAuth callback must stay on the public API origin without an extra `/api`
prefix:

```text
https://api.pull-wise.com/auth/github/callback
```

The login button starts OAuth with a browser navigation to the same-origin
`/api/auth/github/authorize?response=redirect` endpoint. This avoids XHR-only
Cloudflare challenge failures on the OAuth start request. The admin Worker
strips the browser `/api` prefix before forwarding to `PULLWISE_API_ORIGIN` and
does not forward `X-Forwarded-Prefix`.

`PULLWISE_API_ORIGIN` and optional `PULLWISE_API_FALLBACK_ORIGIN` are read by
`worker.js` or `functions/api/[[path]].js` at runtime. They are not
browser-exposed Vite config. The fallback is only used for unauthenticated
GET/HEAD requests when the primary upstream returns a Cloudflare 1003 page.

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
