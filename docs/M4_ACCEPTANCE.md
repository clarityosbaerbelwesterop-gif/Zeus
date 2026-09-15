# PRODUCT M4 — Kai Coding Agent Acceptance

M4 extends the merged M3 runtime in place. It does not create a parallel agent runtime.

## Required capabilities

- Kai repository tools are registered through the canonical M3 `ToolRegistry`.
- Repository work is pinned to an exact 40-character base SHA and a `zeus/*` feature branch.
- Generated and repository code executes only in an isolated Vercel Sandbox, never in the web process.
- Repository/file/terminal/test/Git operations produce bounded durable tool evidence.
- Checkpoint and rewind are available before risky changes.
- Completion requires a successful `repo.complete` tool call and deterministic runtime verification.
- Secret-like content is rejected before repository writes/commits.
- Push and pull-request creation require a persisted approval request and explicit user approval in the run UI.
- Jorge, Lora, Simon and Sara cannot invoke Kai repository mutation tools.
- Repository/session/change-request tables are protected by actor-scoped RLS policies.

## Merge gate

M4 may merge only when the canonical Zeus CI is green: format, lint, strict typecheck, tests, migration/RLS verification, production build and public Playwright coverage.
