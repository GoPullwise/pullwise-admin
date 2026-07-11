# Pullwise Admin Agent Notes

## Worker Deployment Assumptions

Admin worker screens and install payloads must preserve these worker invariants:

- Worker installs target Ubuntu 22.04 only.
- Each worker instance must use only the `codex` binary under
  that worker instance directory.
- Each worker instance must use only its own login state, config, and cache.
- Worker install, doctor, update, cleanup, and job execution must not depend on
  a global CLI, root login state, host `HOME`, host `CODEX_HOME`, or another
  worker instance directory.

## Cloudflare Runtime Configuration

Production `admin.pull-wise.com` must proxy API calls to
`PULLWISE_API_ORIGIN=https://api.pull-wise.com`.

In the Cloudflare Dashboard, verify the runtime value at
`Workers & Pages > pullwise-admin > Settings > Variables and secrets`. The
`PULLWISE_API_ORIGIN` row in that screen must show `https://api.pull-wise.com`;
if it shows `http://localhost:8080`, edit that Dashboard variable before
considering the admin deployment fixed.

`http://localhost:8080` is only valid for local development, Vite proxying, and
the local `preview:workers` flow. Do not commit, push, or deploy a change that
makes the Cloudflare Worker runtime variable, top-level `vars`,
`env.production.vars`, or Cloudflare Dashboard setting for
`PULLWISE_API_ORIGIN` point to localhost or any loopback address. If a
local-only change is needed while debugging, keep it in local command-line
overrides such as `wrangler dev --var ...`, not in committed deploy config.

## Delete Instance Semantics

Admin Delete instance must mean "remove this worker instance and its
worker-host resources", not only "remove this row from the server list". UI copy,
API handling, tests, and status states should reflect that deletion includes
remote worker-host cleanup for the instance's service/config/user/home/log
resources, especially the instance directories under `/var/lib/pullwise-worker`
and `/var/log/pullwise-worker`.

The admin app must not imply the Pullwise Server host is necessarily the worker
host. Workers may be installed on different machines from the server, so delete
status should be modeled as a lifecycle operation whose cleanup is executed by a
worker-host watcher/supervisor/finalizer and reported back to the server.

A worker host can have multiple worker instances. Admin flows must treat each
worker instance and its watcher as a one-to-one pair; never imply that a watcher,
worker process, service user, config, home, log directory, or lifecycle state is
shared between instances.

The watcher is the host-local control role for its paired worker instance. Admin
delete/status semantics should assume the watcher service is reliable, starts
before the worker service, and can stop or remove the worker service plus
instance-owned resources as part of cleanup.

Admin UI/API flows must not imply that watchers are normally stopped or
uninstalled. Once a watcher service has successfully started, non-delete flows
must preserve it. Watcher self-removal is reserved for an administrator actively
choosing Delete instance. In that flow, the worker instance must be successfully
uninstalled first, and only then may the paired watcher remove itself.

## Plans, Providers, And Quota

Admin screens configure plan policy for Pullwise accounts and repositories. Do
not introduce a workspace concept when editing plan, quota, worker, or provider
admin flows.

- Plans are `free`, `pro`, and `max`.
- Plan quota fields represent account/user scan quota, not workspace quota.
- Repository scan quota is configured once as a global monthly quota, not per
  subscription plan. Keep it in the plan/business settings area, but do not add
  admin actions that reset repository quota.
- Review agent policy is plan-scoped and should preserve a single provider plus
  Codex-specific settings:
  - Codex: model and reasoning effort.
- Admin worker install payloads should preserve provider chain order and should
  not imply that global Codex config is shared across workers.
- Treat worker `region` as an operator-defined location label only; it is
  metadata and must not imply scheduler affinity or routing behavior.
- After registration, show the heartbeat-reported worker version as read-only.
  Use the global worker default version plus the registration-time version for
  package selection; do not offer a post-registration desired-version editor.
- Do not expose Codex CLI command/release/version pinning in worker registration UI, plan policy UI, or payloads; server-managed installs use the `openai-codex` SDK with the latest official worker-local standalone CLI and SDK-based device login.
- Do not expose old Codex app-server lifecycle controls in worker registration UI or payloads. SDK-based workers should not receive `PULLWISE_CODEX_APP_SERVER_MAX_AGE_SECONDS` or `PULLWISE_CODEX_APP_SERVER_MAX_TURNS` from admin flows.

## Review Worker Protocol And Copy

Admin worker screens, plan policy, installer payloads, and status views must
follow `../codex_full_repo_review_worker_spec_v1_2_FULL_SELF_CONTAINED.md` and
`review-worker-protocol/v1` terminology. Do not add extra derived-report
requirements, worker-side queue controls, or per-worker parallel job settings.

Admin copy should describe the worker as a Codex full-repository review worker
that submits a stable envelope plus versioned artifacts. Intent-test validation
is dynamic evidence for selected P0/P1 candidates, not an automatic finding
source. Plan policy remains the source of truth for model, timeout, repository
limits, and core reasoning effort; non-core worker phases use the same model
with medium effort.

Plan timeout editors must use native numeric inputs and reject blank, fractional,
non-finite, or out-of-range values before saving. `turnTimeoutSeconds` is an
integer from 60 through 3600; `scanDeadlineSeconds` is an integer from 0
through 21600, where 0 disables the deadline. Never silently replace invalid
operator input with a default.

SMTP SSL and SMTP STARTTLS are mutually exclusive transport modes. Enabling one
in Admin must disable the other before saving.

Admin worker status should preserve server-sanitized Codex app-server quota
telemetry (`codexQuota` / `codex_quota`) from v1 heartbeats. Keep quota-exhausted
or quota-low states distinct from offline, auth-missing, and generic
misconfigured worker states when editing worker detail/list/status UI.

Worker detail APIs may return canonical camelCase fields or server/DB snake_case
fields such as `machineMetrics` / `machine_metrics` and `codexQuota` /
`codex_quota`. Normalize or preserve both shapes before rendering detail panels.

## Admin Scale And Worker Status

Admin worker/status views must handle large worker and scan counts.

- A worker instance always has exactly one job execution slot. Do not expose,
  send, or persist editable `max_concurrent_jobs`, max claim jobs, worker queue
  size, or worker-side job parallelism controls in admin UI or deploy config.
  The server owns the scan job queue; workers claim one job only after finishing
  the current job.
- Use paginated worker APIs. Do not fetch all workers and count running jobs in
  the browser.
- Capacity, queue, worker status, and running-job totals should come from server
  aggregate fields or paginated rows, not client-side scans over full worker or
  scan lists.
- Keep status refresh intervals conservative and pause polling when views are
  hidden if the admin app adds tab visibility handling.
- Do not expose worker host internals, last errors, or machine metrics in
  non-admin/public status surfaces. Admin pages may display them only from
  authenticated admin endpoints.


## Admin Visual And Interaction Resilience

- Keep Admin compact, square, and operational. Use continuous divided KPI bands for fleet summaries instead of a loose grid of decorative cards.
- Keep the authenticated Admin shell split into a persistent desktop control sidebar and an `.admin-view` content region. Below the desktop breakpoint, preserve every route in the sticky horizontally scrollable navigation and keep `aria-current="page"` on the active route.
- Use semantic `MemoryStick` and `HardDrive` icons for RAM and storage telemetry. Keep metric identity on `data-metric` and use the shared `--metric-memory` / `--metric-storage` colors so server and worker performance panels remain consistent.
- Mobile topbar navigation must remain horizontally reachable without widening the document. Long admin identities must truncate within available space, while action buttons such as Sign out remain single-line and non-shrinking.
- Manual refresh and other async mutations need a synchronous in-flight guard in addition to disabled button state so rapid clicks in one render frame cannot issue duplicate requests.
- Worker-detail Refresh must queue `refresh_codex_quota`, poll that exact command to a terminal state, and keep the previous quota visible if refresh fails. Page-level Refresh must trigger the same quota refresh for expanded online idle/degraded workers that already report quota, and prefer quota and machine telemetry with newer `checkedAt` / `collectedAt` timestamps over cached expanded-detail values.
- Frontend regression coverage should include timeout/abort errors, failed-load versus empty-state isolation, pagination/large-count contracts, stale or duplicate operations, long identifiers, and a real 390px browser check where document scrollWidth equals clientWidth.
- Worker list loads must use a latest-request generation so an older page, interval, or refresh response cannot overwrite newer pagination state.
- Pending cleanup workers must remain cached and retained across transient detail failures; remove the retained id only after an explicit 404 or a terminal cleanup lifecycle.
- Serialize all mutations per worker id, while still allowing independent workers to act concurrently. Rendering busy state from only the most recently started action is insufficient.
- Schema-driven numeric inputs must render `min`, `max`, and integer `step`, preserve fractional edits long enough to report them, and reject blank, non-finite, fractional integer, or out-of-range values before saving.
- Keep `scripts/check-mobile-overflow.mjs` in the normal check path. It must load an authenticated production Admin shell in a real headless Chrome 390px viewport and assert `document.documentElement.scrollWidth === clientWidth`.
- API helpers must reject an already-aborted caller signal before starting `fetch`. Cloudflare Worker and Pages proxies must stream body-bearing requests to the authenticated upstream instead of cloning and materializing the full client body at the edge.
