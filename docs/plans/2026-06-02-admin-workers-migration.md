# Admin Workers Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `pullwise-admin` as a separate Cloudflare-deployable admin frontend that uses GitHub login and only shows the workers dashboard to server-authorized administrators.

**Architecture:** The admin app is a small Vite/React SPA in the `admin` repository. It reuses the existing Pullwise server contract: `/auth/session` reports `authenticated` and `admin`, `/auth/github/authorize` starts GitHub login, `/auth/sign-out` ends the session, and `/admin/workers*` powers the workers dashboard. The `web` repository loses the workers route and navigation entry so ordinary users no longer see admin UI there.

**Tech Stack:** React 18, Vite, Vitest, Testing Library, axios, zod, lucide-react, Cloudflare Workers static assets proxy.

---

### Task 1: Scaffold Admin App Metadata

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.js`
- Create: `vitest.config.js`
- Create: `eslint.config.js`
- Create: `.gitignore`
- Create: `.env.example`
- Modify: `README.md`

**Step 1: Write the failing smoke command**

Run: `npm test -- --run`

Expected: FAIL because no package/test script exists yet.

**Step 2: Add minimal Vite metadata**

Create package scripts for `dev`, `build`, `preview`, `test`, `lint`, `check`, `preview:workers`, and `deploy:workers`. Use dependency versions matching `web/package.json` to keep the two frontends compatible.

**Step 3: Run test command**

Run: `npm test -- --run`

Expected: tests can be discovered once source/test files exist.

### Task 2: Add API/Auth Foundation

**Files:**
- Create: `src/config/env.js`
- Create: `src/config/env.test.js`
- Create: `src/api/http.js`
- Create: `src/api/pullwise.js`
- Create: `src/lib/auth.js`
- Create: `src/lib/auth.test.js`
- Create: `src/test/setup.js`

**Step 1: Write failing tests**

Tests must prove:
- `parseEnv` accepts a root-relative API base URL such as `/api`.
- `startGitHubLogin` calls `/auth/github/authorize` with a redirect back to the current admin page.
- missing authorize URLs throw a clear error.
- `signOut` calls `/auth/sign-out` and navigates back to `/login`.

Run: `npm test -- src/config/env.test.js src/lib/auth.test.js`

Expected: FAIL because the modules do not exist.

**Step 2: Implement minimal API/auth code**

Implement only session, sign-out, GitHub authorize, and admin worker endpoints.

**Step 3: Run tests**

Run: `npm test -- src/config/env.test.js src/lib/auth.test.js`

Expected: PASS.

### Task 3: Build Admin Auth Gate

**Files:**
- Create: `src/App.jsx`
- Create: `src/App.test.jsx`
- Create: `src/main.jsx`
- Create: `src/i18n.jsx`
- Create: `src/icons.jsx`
- Create: `src/lib/browser-storage.js`

**Step 1: Write failing tests**

Tests must prove:
- unauthenticated users see the GitHub login button.
- clicking the login button starts GitHub login.
- authenticated non-admin users see an access denied screen and do not render workers.
- authenticated admin users render the workers dashboard.

Run: `npm test -- src/App.test.jsx`

Expected: FAIL because `App.jsx` does not exist.

**Step 2: Implement minimal app**

Create a single-screen admin app. Do not add public landing, repository, issue, billing, or settings screens.

**Step 3: Run tests**

Run: `npm test -- src/App.test.jsx`

Expected: PASS.

### Task 4: Migrate Workers Dashboard

**Files:**
- Create: `src/screens/workers.jsx`
- Create: `src/screens/workers.test.jsx`
- Create: `src/shell.jsx`
- Create: `src/styles/base.css`
- Create: `src/styles/screens.css`
- Create: `src/app.css`

**Step 1: Write failing tests**

Tests must prove:
- the dashboard lists workers from `/admin/workers`.
- create worker shows the one-time token and install commands.
- worker actions call enable, disable, patch, rotate, test, and delete endpoints.

Run: `npm test -- src/screens/workers.test.jsx`

Expected: FAIL until the screen and API client exist.

**Step 2: Move minimal worker UI**

Port `web/src/screens/workers.jsx` and enough shared shell/style code to make it standalone. Remove repository and issue search dependencies from the admin shell.

**Step 3: Run tests**

Run: `npm test -- src/screens/workers.test.jsx`

Expected: PASS.

### Task 5: Add Cloudflare Deployment Proxy

**Files:**
- Create: `worker.js`
- Create: `worker.test.js`
- Create: `wrangler.jsonc`
- Create: `functions/api/[[path]].js`

**Step 1: Write failing proxy tests**

Tests must prove:
- `/api/admin/workers` proxies to `${PULLWISE_API_ORIGIN}/admin/workers`.
- hop-by-hop headers are stripped.
- missing `PULLWISE_API_ORIGIN` returns a JSON 500.

Run: `npm test -- worker.test.js`

Expected: FAIL because `worker.js` does not exist.

**Step 2: Implement the proxy**

Copy the existing same-origin proxy pattern from `web`, with `wrangler.jsonc` named `pullwise-admin`.

**Step 3: Run tests**

Run: `npm test -- worker.test.js`

Expected: PASS.

### Task 6: Remove Admin Entry Points From Web

**Files:**
- Modify: `../web/src/App.jsx`
- Modify: `../web/src/shell.jsx`
- Modify: `../web/src/lib/navigation.js`
- Modify: `../web/src/App.test.jsx`
- Modify: `../web/src/shell.test.jsx`

**Step 1: Write failing web tests**

Tests must prove:
- `/workers` no longer renders `WorkersScreen`.
- the sidebar no longer includes a Workers item.

Run: `npm test -- src/App.test.jsx src/shell.test.jsx`

Expected: FAIL before removing the route and navigation entry.

**Step 2: Remove web admin UI entry points**

Delete the workers route import/render path and Sidebar item. Keep server `/admin/*` APIs unchanged.

**Step 3: Run tests**

Run: `npm test -- src/App.test.jsx src/shell.test.jsx`

Expected: PASS.

### Task 7: Verify

**Files:**
- No code changes unless verification finds defects.

**Step 1: Run admin checks**

Run: `npm run check`

Expected: PASS.

**Step 2: Run web targeted checks**

Run: `npm test -- src/App.test.jsx src/shell.test.jsx`

Expected: PASS.

**Step 3: Build admin**

Run: `npm run build`

Expected: PASS and `dist` generated.

**Step 4: Review deployment notes**

Confirm `README.md` documents:
- admin app does not store GitHub OAuth secrets.
- server owns admin email/user ID authorization.
- server must allow the admin origin in `PULLWISE_ALLOWED_ORIGINS`.
- if proxy-derived callback URLs are used, GitHub OAuth must allow the admin callback URL.
