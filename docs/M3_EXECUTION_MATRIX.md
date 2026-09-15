# PRODUCT M3 — Agent Runtime execution matrix

Base: merged PRODUCT M2 + integrity repair (`663ea5907a3bc8afb21752885331dc34a796e363`). This matrix is a working implementation contract, not a completion claim.

| Area                              | State after M2 repair | M3 action                                                                                                              |
| --------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Existing Run model                | PARTIAL               | Extend in place with tenant ownership, trigger/type, retry/delegation, errors, lease/idempotency and timestamps.       |
| Existing RunStep model            | PARTIAL               | Preserve authority; add explicit step types/status semantics and evidence.                                             |
| RunEvent model                    | MISSING               | Add durable workspace/org-scoped safe runtime events.                                                                  |
| ToolCall persistence              | MISSING               | Persist invocations, safe summaries, side-effect level, result status and errors.                                      |
| Verification model                | MISSING               | Persist deterministic checks against canonical data.                                                                   |
| Usage model                       | MISSING               | Persist provider-reported usage and latency; never fabricate cost.                                                      |
| Approval model                    | MISSING               | Add durable waiting/approval boundary for future higher-risk tools.                                                     |
| Agent definitions                 | PARTIAL               | Preserve five canonical templates; add central runtime policies/instruction composition.                               |
| Context assembler                 | PARTIAL               | Reuse M2 bounded WorkspaceContext; add budgets and safe trace metadata.                                                  |
| Context budgets                   | MISSING               | Enforce P0–P6 prioritization and bounded context selection.                                                             |
| Model provider abstraction        | PARTIAL               | Harden existing `@zeus/runtime` contract; add OpenRouter adapter with typed unconfigured state.                         |
| OpenRouter                        | MISSING               | Add server-only configurable adapter; absence remains `PROVIDER_NOT_CONFIGURED`.                                        |
| ToolRegistry                      | PARTIAL               | Finish one canonical registry with schema validation, authorization, connection and side-effect enforcement.           |
| Built-in internal tools           | MISSING               | Expose M2 workspace/task/plan/memory/artifact/conversation/activity/agent domains without duplication.                  |
| Execution loop                    | MISSING               | Implement bounded durable queued → preparing → running → waiting/verifying → terminal execution.                        |
| Streaming                         | MISSING               | Add bounded transport without persisting token chunks.                                                                 |
| Cancellation                      | MISSING               | Abort provider/tool work, close active step, persist cancellation and release lease.                                    |
| Retry                             | PARTIAL               | Reuse retry helper for temporary errors; user retry creates a new auditable run.                                        |
| Waiting                           | MISSING               | Persist user-input/authorization/connection-required states and safe reasons.                                           |
| Idempotency                       | MISSING               | Stable invocation identity and duplicate-prevention for mutating tools.                                                 |
| Lease / stale-run handling        | MISSING               | Add lease ownership/expiry/heartbeat and stale recovery policy.                                                         |
| Prompt-injection boundary         | MISSING               | Treat uploaded/artifact/tool data as untrusted; separate system, agent, user and tool-data policy layers.               |
| Tasks / Plans / Artifacts / Memory| COMPLETE M2 authority | Expose only through authorized internal tools; do not duplicate repositories.                                           |
| Activity                          | COMPLETE M2 authority | Project server-authored run events into workspace activity.                                                             |
| Run UI                            | MISSING               | One reusable safe Run panel across conversation, task and activity.                                                     |
| Task execution                    | MISSING               | Add real task → run → agent → tools/artifact → verification workflow without auto-completing on text alone.             |
| Conversation execution            | PARTIAL               | Replace bootstrap waiting run with real runtime execution and final-response persistence.                               |
| Activity projection               | PARTIAL               | Derive presence/activity from durable run state and events.                                                             |
| RLS                               | PARTIAL               | Extend FORCE RLS to every new runtime table and direct-ID tests.                                                        |
| Tests                             | PARTIAL               | Deterministic mock provider remains test-only; add unit/integration/RLS/E2E failure/cancel/retry paths.                  |
| Infrastructure                    | BLOCKED                | Existing Neon project verified; production Zeus schema and one linked Zeus Vercel project still need reconciliation.    |
| Deployment                        | BLOCKED                | Preview/production cannot be claimed until DB schema, Vercel project, environment and browser smoke verification exist. |

## Hard boundaries

- One canonical runtime: `packages/runtime`.
- No chain-of-thought persistence or display.
- M3 implements internal Level 0–1 workspace tools; no arbitrary shell, browser computer use, Git commits, or external send actions.
- External/tool/file content is untrusted data and cannot redefine system policy or permissions.
- OpenRouter absence is a typed `PROVIDER_NOT_CONFIGURED` state, never a fake response.
- Important execution state is durable; irreversible future actions may not be blindly resumed.
