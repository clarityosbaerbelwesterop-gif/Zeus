# PRODUCT M2 implementation matrix

Authoritative base: merged PRODUCT M1 on `main` at `1e5bf4ecb1e6245883124a71f4551108ad10b8e6`.

Legend: A complete, B partial, C missing, D repair required, E intentionally deferred.

| Area                        | State | M2 action                                                                                               |
| --------------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| A Workspace lifecycle       | B     | Extend the existing workspace authority with objective, focus, status, archive and creation context.    |
| B Workspace navigation      | B     | Keep the M1 shell and add home/views, switching, search and settings without a second router authority. |
| C Agent team configuration  | B     | Reuse canonical agent templates/workspace_agents and derive presence from real runs.                    |
| D Conversation architecture | B     | Extend existing conversations with explicit types and persistent direct/team semantics.                 |
| E Team conversations        | B     | Add explicit conversation participants; never infer participants from message text.                     |
| F Task system               | C     | Add persistent tasks plus lightweight links to conversations, runs and artifacts.                       |
| G Plan system               | C     | Add plans and ordered plan steps linked to tasks/runs.                                                  |
| H Artifact system           | B     | Extend existing artifacts with type, creator-agent, task/conversation provenance and timestamps.        |
| I File system               | C     | Add authorized workspace file metadata and a bounded storage abstraction; never execute uploads.        |
| J Project memory            | C     | Add typed goals/decisions/facts/preferences/constraints/project-context entries.                        |
| K Activity timeline         | C     | Add user-facing workspace_events distinct from security audit events.                                   |
| L Presence/status           | C     | Derive status deterministically from persisted run state and recent completion.                         |
| M Search                    | C     | Add bounded PostgreSQL-backed grouped workspace search.                                                 |
| N Command palette           | C     | Add keyboard/touch command palette using existing routes/actions.                                       |
| O Permissions               | D     | Expand roles to viewer and centralize application authorization; retain RLS as second boundary.         |
| P Audit integration         | B     | Preserve audit_events and emit security-sensitive mutations through the same authority.                 |
| Q API boundaries            | B     | Keep server actions/domain services; add an authorized file download route only.                        |
| R Database schema           | B     | Add one M2 migration extending existing tables; no v2 tables for existing authorities.                  |
| S RLS                       | D     | Add RLS for every M2 tenant-owned table and viewer/write boundaries.                                    |
| T Responsive UI             | B     | Refine M1 shell for desktop, iPad landscape/portrait and mobile.                                        |
| U Testing                   | B     | Extend unit/integration/schema/RLS/E2E coverage for M2.                                                 |
| V Deployment                | B     | Reuse the existing Zeus Vercel/Neon resources; preview verification before merge.                       |

## Preserved M1 authorities

M2 keeps exactly one authority for authentication, organization, workspace, membership, agent templates, conversations, messages, runs/run steps, artifacts, connections, API tokens and security audit events. New M2 objects extend those boundaries instead of replacing them.

## Deliberate limits

M2 does not add an autonomous agent runtime, unrestricted code execution, browser computer use, vector memory, billing, new model-provider credentials or a second storage/database service. If a model provider is absent, persisted work remains usable and agent execution stays explicitly unavailable.
