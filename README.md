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

## Cloudflare Workers Deployment

For the current custom admin URL with a separate API origin:

```bash
# .env.production
VITE_APP_URL=https://admin.pull-wise.com
VITE_API_BASE_URL=https://api.pull-wise.com
```

For this direct API mode, configure `pullwise-server` for exact credentialed
CORS and same-site subdomain cookies:

```bash
PULLWISE_ALLOWED_ORIGINS=https://pull-wise.com,https://admin.pull-wise.com
PULLWISE_COOKIE_SECURE=true
PULLWISE_API_BASE_URL=https://api.pull-wise.com
```

The GitHub OAuth app callback should stay on the API origin:

```text
https://api.pull-wise.com/auth/github/callback
```

In direct API mode, the admin login button starts OAuth with a browser
navigation to `/auth/github/authorize?response=redirect`, so deploy a
`pullwise-server` version that supports that redirect response mode.

If you instead want same-origin API proxying through the admin Worker, set:

```bash
VITE_API_BASE_URL=/api
PULLWISE_API_ORIGIN=https://api.pull-wise.com
PULLWISE_TRUST_PROXY_HEADERS=true
```

`PULLWISE_API_ORIGIN` is read by `worker.js` or `functions/api/[[path]].js` at
runtime. It is not browser-exposed Vite config, and is only needed for the
same-origin `/api` proxy mode.

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
