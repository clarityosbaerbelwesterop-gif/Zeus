# PRODUCT M3 — Agent Runtime execution matrix

Base: merged PRODUCT M2 (`2fbd82678ee7172eeab954a6e9ce37be8c56b861`). This matrix is a working implementation contract, not a completion claim.

| Area | State at M3 start | M3 action |
|---|---|---|
| Existing Run model | PARTIAL | Extend in place with tenant ownership, trigger/type, retry/delegation, errors, lease/idempotency and timestamps. |
| Existing RunStep model | PARTIAL | Preserve authority; add explicit step types/status semantics and evidence. |
| Agent definitions | PARTIAL | Preserve five canonical templates; add central runtime policies/instruction composition. |
| Context assembler | PARTIAL | Reuse M2 bounded WorkspaceContext; add budgets and safe trace metadata. |
| Tasks / Plans / Artifacts / Memory | COMPLETE M2 authority | Expose only through authorized internal tools; do not duplicate repositories. |
| Activity | COMPLETE M2 authority | Project server-authored run events into workspace activity. |
| Model provider abstraction | PARTIAL | Harden existing `@zeus/runtime` contract; add OpenRouter adapter with typed unconfigured state. |
| Streaming | MISSING | Add bounded transport without persisting token chunks. |
| Tool abstraction | MISSING | One ToolRegistry; schema validation, tenant authorization, side-effect levels and idempotency. |
| Execution state machine | MISSING | Explicit queued/preparing/running/waiting/verifying/terminal transitions. |
| Cancellation / retry | MISSING | Abort-aware cancellation; retries create new auditable runs. |
| Permission enforcement | PARTIAL | Reuse M2 centralized role capabilities plus tool/agent policy. |
| Usage / verification | MISSING | Persist deterministic verification and provider-reported usage only. |
| Runtime UI | MISSING | One reusable live Run panel across conversation/task/activity. |
| RLS | PARTIAL | Extend FORCE RLS to every new runtime table and direct-ID tests. |
| Tests | PARTIAL | Deterministic mock provider remains test-only; add state/tool/integration/RLS/E2E failure paths. |
| Deployment | BLOCKED EXTERNALLY | Repository has no Zeus Vercel project visible to the connected Vercel account; production Neon currently exposes Neon Auth tables but Zeus application migrations are not applied. Do not fake preview/production verification. |

## Hard boundaries

- One canonical runtime: `packages/runtime`.
- No chain-of-thought persistence or display.
- M3 implements internal Level 0–1 workspace tools; no arbitrary shell, browser computer use, Git commits, or external send actions.
- External/tool/file content is untrusted data and cannot redefine system policy or permissions.
- OpenRouter absence is a typed `PROVIDER_NOT_CONFIGURED` state, never a fake response.
- Important execution state is durable; irreversible future actions may not be blindly resumed.
