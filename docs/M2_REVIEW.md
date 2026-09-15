# PRODUCT M2 repair review

Reviewed base: `08544024767bf6eee3562b8ac0fb66493878da13`, PR #2.

## Repairs

- Home, Tasks, Plans and other workspace views no longer resolve to a default conversation.
- Plan navigation respects the selected plan across reloads.
- Conversation history is bounded to the most recent 100 messages.
- Workspace events, audits and uploads use the workspace's organization.
- Direct conversation creation and plan-step ordering are serialized.
- Migration 0004 constrains cross-workspace references and task relationship tables, limits agent configuration to administrators, and preserves the final workspace owner.
- A checksum-based SQL migration runner and direct RLS runner are available in `packages/db`.
- Removed generated TypeScript build metadata from version control.
- Rollup is pinned to 4.63.2 because 4.63.3 did not satisfy the environment's minimum release age. Optional dependency install scripts remain disabled.

## Evidence

Local strict typecheck, lint, formatting, 24 tests and the production Next.js build passed. Migrations 0001–0004 were applied through the Neon connector to the isolated `zeus-m2-m3-verification` branch (`br-bold-pine-b1hsbxwx`) of the existing Zeus project (`aged-mode-27990486`). The direct SQL RLS test transaction passed and rolled back its fixture data.

The inherited authenticated E2E test was stale. Its selectors and coverage now include workspace navigation, plan selection and message persistence; it requires a reachable isolated database/Auth environment. This environment cannot reach Neon through PostgreSQL TCP, so a full live authenticated browser pass is not claimed here. Canonical PR CI separately verifies the public desktop and iPad surfaces.

## Infrastructure finding

The connected Vercel team has no Zeus project (project lookup returns 404). The Neon production branch currently has Managed Auth but no `zeus` schema. M1/M2 deployment claims must therefore not be treated as established. No replacement project was created. A real Preview and production rollout remain infrastructure gates for M3.
