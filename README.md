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

For the current `workers.dev` admin URL:

```bash
# .env.production
VITE_APP_URL=https://pullwise-admin.danuberiverferryman.workers.dev
VITE_API_BASE_URL=https://api.pull-wise.com
```

This keeps GitHub OAuth on the existing API callback URL:

```text
https://api.pull-wise.com/auth/github/callback
```

Because `workers.dev` and `pull-wise.com` are different sites, the server must
allow credentialed cross-site requests:

```bash
PULLWISE_ALLOWED_ORIGINS=https://pull-wise.com,https://pullwise-admin.danuberiverferryman.workers.dev
PULLWISE_COOKIE_SAME_SITE=None
PULLWISE_COOKIE_SECURE=true
```

The `/api` proxy remains available for deployments that want same-origin API
proxying:

```bash
VITE_API_BASE_URL=/api
```

When using that proxy, configure the Worker runtime origin separately in
`wrangler.jsonc` or as a Cloudflare Worker variable:

```bash
PULLWISE_API_ORIGIN=https://api.pull-wise.com
```

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
PULLWISE_ALLOWED_ORIGINS=https://pull-wise.com,https://pullwise-admin.danuberiverferryman.workers.dev
```

If the server derives OAuth callback URLs from trusted proxy headers for the
proxy mode, make sure GitHub OAuth allows the admin callback URL:

```text
https://pullwise-admin.danuberiverferryman.workers.dev/api/auth/github/callback
```

If the server is configured with a fixed `PULLWISE_API_BASE_URL`, GitHub only
needs the callback for that fixed URL.
