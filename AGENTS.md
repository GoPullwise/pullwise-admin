# Pullwise Admin Agent Notes

## Plans, Providers, And Quota

Admin screens configure plan policy for Pullwise accounts and repositories. Do
not introduce a workspace concept when editing plan, quota, worker, or provider
admin flows.

- Plans are `free`, `pro`, and `max`.
- Plan quota fields represent account/user scan quota and repository scan
  quota, not workspace quota.
- Review agent policy is plan-scoped and should preserve provider chains plus
  provider-specific settings:
  - Codex: model and reasoning effort.
  - OpenCode: model and variant.
- Admin worker install payloads should preserve provider chain order and should
  not imply that global Codex/OpenCode config is shared across workers.
