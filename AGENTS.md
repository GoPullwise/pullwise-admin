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
