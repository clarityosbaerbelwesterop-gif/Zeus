# Zeus

Zeus is a clean, workspace-first AI work environment for specialized AI teammates. M1 establishes the production foundation: Next.js, Neon Postgres, Managed Better Auth, real tenant isolation, durable workspaces/conversations/runs, and a safe provider/tool boundary.

## Product team

- **Jorge** — Manager / Chief of Staff
- **Kai** — Senior Software Engineer
- **Lora** — Product Designer
- **Simon** — QA + Security Engineer
- **Sara** — Sales / GTM

## Monorepo

- `apps/web` — Next.js product and landing experience
- `packages/auth` — Managed Better Auth boundary
- `packages/db` — Drizzle schema, actor-scoped transactions, migrations
- `packages/agents` — canonical system agent templates
- `packages/runtime` — run/model-provider contracts
- `packages/mcp` — provider-neutral connection contracts
- `packages/security` — opaque token and input-security primitives
- `packages/shared` — shared validation/types

No AI key is required to boot Zeus. Without a configured model provider, Zeus persists the user's work and exposes a truthful `provider not configured` run state rather than fabricating AI output.
