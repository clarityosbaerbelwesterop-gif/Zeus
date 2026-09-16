# Zeus repository consolidation authority

Date: 2026-09-16

## Purpose

Zeus is the canonical product and integration repository. Odin, Build-your-Buissness and
swarm-compute-protocol remain source/legacy repositories while their useful implementation is
selectively consolidated. They are not to be physically concatenated into Zeus and are not to be
archived or deleted until the inventory is complete and the adopted capability has passed Zeus CI.

## Audited source baselines

| Repository | Audited `main` | Role in consolidation |
| --- | --- | --- |
| `clarityosbaerbelwesterop-gif/Zeus` | `24a763d738c09d7d6ee4a40ac9119af5795d31aa` | Canonical product, database/auth/runtime/deployment/UI authority |
| `clarityosbaerbelwesterop-gif/Odin-Agent-` | `62004f27ae542803ca51f59af66f60ef6aa19f3b` | Runtime durability, mission semantics, recovery, verification and efficiency source |
| `clarityosbaerbelwesterop-gif/Build-your-Buissness` | `14c44e5ac99a00a44f115f17b8cade940aec6940` | Business-plan/order UX, business lifecycle and autonomous-operation source |
| `clarityosbaerbelwesterop-gif/swarm-compute-protocol-` | `ab2db73f36adff7ceea6130855a990d8e652720e` | Governance, policy, connector and defensive security source |

## Non-negotiable single authorities

Zeus must retain exactly one canonical implementation for each of these concerns:

1. Database schema and migrations: `packages/db`.
2. Authentication/session boundary: `packages/auth` plus the canonical web session integration.
3. Agent/run execution: `packages/runtime`; no second mission runtime may be started beside it.
4. Tool/action authority: Zeus ToolRegistry and its policy/connection boundaries.
5. Workspace/task/plan/artifact state: Zeus workspace/database models.
6. External connections and MCP: Zeus `packages/mcp` and the canonical connection records.
7. Security utilities and audit metadata: `packages/security` plus RLS/runtime policy enforcement.
8. Product UI and deployment: `apps/web` and the canonical Zeus Vercel project.

Source implementations are therefore adopted as algorithms, invariants, tests, adapters or UX
patterns. Source auth systems, databases, deployments, account models and duplicate runtime stores
must not be copied in wholesale.

## Consolidation matrix

| Capability | Zeus current authority | Strong source | Decision |
| --- | --- | --- | --- |
| Run state/tool loop | `packages/runtime/src/engine.ts` | Odin mission runtime | KEEP_ZEUS, port stronger invariants only |
| Runtime usage limits | `RuntimePolicy` exists; cumulative telemetry enforcement was missing | Odin budget counters | ADOPT into Zeus runtime guardrails |
| Long-run recovery checkpoint integrity | no dedicated minimal integrity helper | Odin `src/mission/checkpoint.ts` | ADOPT with Zeus-safe minimal state |
| DAG/team coordination | `team-automation.ts` | Odin mission DAG, BYB work planning | KEEP_ZEUS, compare semantics before extending |
| Verification/repair | runtime verification callback plus M4 completion evidence | Odin evidence/repair loop | EXTEND_ZEUS in a later isolated slice |
| Model/provider boundary | OpenRouter/UNOROUTER adapters | Odin provider abstractions | KEEP_ZEUS provider authority; port only missing hardening |
| Business order/product flow | Zeus tasks/plans/TeamRun | BYB validated order planner | ADAPT product semantics, never duplicate persistence |
| Business lifecycle/worker leases | Zeus runtime/team automation | BYB | INVENTORY then EXTEND Zeus models/runtime |
| Governance identity/policy | Zeus auth/security/runtime boundaries | SCP | ADAPT policies onto Zeus actor/org identities |
| Connector governance | Zeus MCP/connected-app boundary | SCP | ADAPT missing checks; no duplicate vault or connector DB |
| Source local JSON/state ledgers | stronger Zeus DB/RLS exists | Odin/BYB/SCP legacy/prototypes | REJECT |
| Source Vercel/Neon/Auth projects | Zeus canonical infrastructure must stay singular | all sources | REJECT duplication |

## Slice 1 — Odin runtime guardrails

This branch begins the selective merge with two bounded, dependency-light capabilities:

- `packages/runtime/src/budget.ts`: a fail-closed per-run usage ledger for token and estimated-cost
  budgets. It rejects malformed/missing provider telemetry when the matching hard limit is enabled.
- `packages/runtime/src/checkpoint.ts`: a minimal SHA-256 integrity-protected recovery checkpoint.
  It intentionally excludes prompts, tool payloads, credentials and artifacts.

Both are accompanied by deterministic tests and package exports. They do not create a second runtime,
database, auth system, tool registry or deployment.

## Next slices

1. Wire the budget ledger into the canonical `executeRun` loop and persist safe cumulative usage
   evidence through the existing RuntimeStore.
2. Add checkpoint persistence only through the canonical DB/runtime store; no local-file checkpoint
   authority.
3. Compare Odin verification/repair semantics against Zeus verification and port only missing
   deterministic recovery behavior.
4. Inventory BYB order/lifecycle code and map it onto Zeus Task/Plan/TeamRun rather than adding an
   `Order` database authority unless a real schema gap is proven.
5. Inventory SCP governance/connector checks and express them through Zeus actor/org, MCP and security
   primitives.
6. Run the full Zeus CI, RLS and public E2E gates before each merge to `main`.

## Archive rule

Odin, Build-your-Buissness and swarm-compute-protocol stay untouched and available as source evidence
until every adopted capability is inventoried and Zeus has replacement evidence on `main`. Archiving
is a separate explicit cleanup action after consolidation, not part of a capability port.
