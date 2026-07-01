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

## Plans, Providers, And Quota

Admin screens configure plan policy for Pullwise accounts and repositories. Do
not introduce a workspace concept when editing plan, quota, worker, or provider
admin flows.

- Plans are `free`, `pro`, and `max`.
- Plan quota fields represent account/user scan quota and repository scan
  quota, not workspace quota.
- Review agent policy is plan-scoped and should preserve a single provider plus
  Codex-specific settings:
  - Codex: model and reasoning effort.
- Admin worker install payloads should preserve provider chain order and should
  not imply that global Codex config is shared across workers.

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

Admin worker status should preserve server-sanitized Codex app-server quota
telemetry (`codexQuota` / `codex_quota`) from v1 heartbeats. Keep quota-exhausted
or quota-low states distinct from offline, auth-missing, and generic
misconfigured worker states when editing worker detail/list/status UI.

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
