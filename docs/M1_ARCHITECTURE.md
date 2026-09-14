# PRODUCT M1 — Zeus foundation

## Authority map

**Repository:** pnpm monorepo. `apps/web` owns HTTP/UI; domain packages own business/security contracts.

**Frontend:** Next.js App Router, TypeScript, Tailwind CSS, original warm near-white Zeus design system. The app is workspace-first rather than dashboard-first.

**Backend:** server components/actions and route handlers call package APIs. UI components never query Postgres directly.

**Database:** Neon PostgreSQL 18 in Frankfurt. Drizzle mirrors the schema; versioned SQL remains migration authority. Tenant tables use mandatory RLS.

**Authentication:** Neon Managed Better Auth. Sessions are server-verifiable and provider additions do not require an auth rewrite.

**Tenant hierarchy:** authenticated user → organization → workspace → conversations/runs/artifacts/connections. Organization and workspace membership are explicit.

**Agents:** five immutable system templates (Jorge, Kai, Lora, Simon, Sara); workspaces enable references rather than duplicating prompts per user.

**Runtime:** one Run plus ordered Run Steps is the visible execution authority. Operational summaries and tool events may be shown; hidden chain-of-thought is never stored as product activity.

**MCP / OAuth:** provider-neutral connection records contain status/scopes and secret references only. Raw OAuth/provider tokens must live in an encrypted secret boundary added by the provider integration milestone.

**Sandbox:** `ModelProvider`, `ToolRegistry` and run recording are separated from the Next.js process so later isolated workers can be introduced without replacing product state.

**Deployment:** Vercel is the intended web runtime; Neon is an independent Zeus-only project. Preview must pass before production.

**Testing:** unit tests validate templates/tokens/contracts; migration tests assert RLS coverage; live integration tests use an isolated Neon branch; Playwright validates landing and the authenticated workspace flow.

**Security:** strict validation, server-verified identity, RLS, opaque-token hashing, safe audit metadata, security headers and same-origin mutation boundaries. Production/destructive actions are never silently pre-authorized.
