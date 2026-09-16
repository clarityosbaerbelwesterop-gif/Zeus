# ZEUS V1 source migration matrix

This file is the authority for donor capability consolidation. Zeus remains the
only product/runtime authority. Donor repositories remain source/legacy systems
and are not vendored wholesale.

Status vocabulary: **KEEP ZEUS**, **PORT**, **ADAPT**, **REWRITE**,
**REFERENCE ONLY**, **REJECT**.

## Source snapshots reviewed

<!-- prettier-ignore -->
| Source | Snapshot | License / treatment |
|---|---|---|
| Zeus | `9549d84e3c5c1444ed4b6bed34023ef6e4ae914a` at start of this pass | Canonical product |
| Odin-Agent- | `88f7d10112d8393dc69268f7ebdf0967e84235a4` | User-owned donor; capability migration only |
| Build-your-Buissness | `fc1a70f33945b413cc21ff3b78e2cbd56a462755` | User-owned donor; capability migration only |
| swarm-compute-protocol- | `ed72a44ed70342707a7f9ca36c7359ec61f9ef5f` | User-owned donor; security/integration lessons only |
| NousResearch/hermes-agent | `682a95258ce9e877cfb607a5ada6436183efdebb` reviewed for current skill architecture | MIT; copied code requires notice/attribution. Current V1 work below is conceptual adaptation unless explicitly marked copied. |

## Capability decisions

<!-- prettier-ignore -->
| Capability | Source path / evidence | Decision | Zeus authority / destination | Security + test requirement | Migration status |
|---|---|---|---|---|---|
| Core Run / RunStep execution | Zeus runtime + DB migrations | **KEEP ZEUS** | `packages/runtime`, `packages/db`, web run APIs | deterministic state transitions; persisted steps; retry/cancel tests | Active |
| Provider routing / budgets / fallback | Odin `odin_agent/model_router.py`, `odin_agent/budget.py`, `odin_agent/providers/*` | **ADAPT** | Existing Zeus provider abstraction / run budget state | provider failures cannot corrupt run; cumulative budget tests | Partially integrated; Zeus remains authority |
| Planner / task DAG concepts | Odin `odin_agent/planner.py`, `odin_agent/task_graph.py` | **ADAPT** | Zeus Plan/Task/TeamRun authorities | idempotency, leases, bounded retries, durable plan state | Existing Zeus runtime retained; further Mission layer pending |
| Checkpoint/recovery concepts | Odin `odin_agent/checkpoint.py`, `odin_agent/mission_controller.py` | **ADAPT** | Zeus persisted runs / execution sessions | restart/reconnect/retry tests | Existing persistence retained; hardening ongoing |
| Repository coding execution | Zeus M4 implementation | **KEEP ZEUS** | `apps/web/lib/kai-coding-tools.ts`, `packages/runtime/src/m4-boundaries.ts` | arbitrary authorized owner/repo; `zeus/*` branch isolation; no protected-branch direct writes | Active; repository-agnostic regression added in PR #10 |
| Five visible employee agents | Zeus TeamRun/agent definitions | **KEEP ZEUS** | Zeus team runtime/UI | real persisted collaboration only; no fake teammate chat | Active |
| Internal subagent delegation | Odin subagent concepts; Hermes delegation patterns | **ADAPT** | Zeus parent/child runs | child permissions/budgets may narrow only; cancellation propagation | Pending V1 hardening |
| Skills discovery / progressive disclosure | Hermes `skills/**/SKILL.md`, `agent/skill_bundles.py`, `agent/skill_preprocessing.py` | **ADAPT** | New canonical Zeus Skill/SkillVersion authority | schema validation; trust level; tool/permission intersection; bounded context | Pending implementation |
| Skill provenance / mutation audit | Hermes `tools/skill_provenance.py`, `tools/skill_ledger.py` | **ADAPT** | Zeus skill revision + AuditEvent model | generated skill starts untrusted; immutable provenance; rollback/audit tests | Pending implementation |
| Skill linting | Hermes `tools/skill_linter.py` | **REFERENCE ONLY** | Zeus-native validation rules | do not assume advisory lint equals security review | Pending Zeus-native implementation |
| Memory hierarchy | Odin `odin_agent/memory.py`; existing Zeus memory | **KEEP ZEUS + ADAPT** | Existing Zeus Memory authority | candidate -> validate -> persist; provenance/scope; bounded retrieval | Existing Zeus authority retained |
| Autonomous company lifecycle | Build-your-Buissness product model | **REWRITE** | Zeus Company/Mission/Plan/Task model | tenant isolation; approvals for consequential actions | Pending canonical Company/Mission schema |
| Continuous business operations | BYB concepts + Zeus existing Autopilot | **KEEP ZEUS + ADAPT** | Existing Zeus Autopilot | leases, budgets, approval gates, bounded retries | Existing Autopilot retained; no second scheduler |
| Tool registry / policy pipeline | Zeus ToolRegistry + SCP policy lessons | **KEEP ZEUS** | One Zeus ToolRegistry | intent -> validation -> policy -> approval -> execution -> audit | Active; approval coverage hardening pending |
| Connection abstraction | Zeus M5 connections; SCP integration lessons | **KEEP ZEUS + ADAPT** | Existing Zeus Connection/CredentialVault authority | never fake CONNECTED; capability probe; workspace scope | Active; provider-by-provider acceptance pending |
| Credential vault | Zeus M5 | **KEEP ZEUS** | Existing CredentialVault | no plaintext logs; tenant isolation; envelope-key requirements | Active; production-key verification pending |
| Secret sync | SCP workflows/lessons | **ADAPT** | Vercel runtime env + GitHub Actions only where needed | minimum-secret principle; names/status only; never copy legacy dump | Production configuration pending |
| Scheduler / cron | Hermes scheduler concepts | **REFERENCE ONLY** | Existing Zeus Autopilot/Automation authority | no parallel scheduler authority | Do not import as second scheduler |
| MCP | Hermes MCP + Zeus/SCP connections | **ADAPT** | Zeus connector abstraction | malicious metadata/input tests; explicit trust boundaries | Pending capability-specific integration |
| Terminal backend | Odin terminal/sandbox concepts; Hermes terminal patterns | **KEEP ZEUS + ADAPT** | Existing Kai ExecutionBackend/Sandbox boundary | path/symlink/command/network policy; timeout/resource limits | Active safe backend; additional backends optional |
| Competitor UX patterns | Emergent/E3, Polsia, Strawberry, Grok public behavior | **REFERENCE ONLY** | Zeus ChatHub / Company UX | independent implementation; no proprietary code copying | Product-pattern research only |

## Non-negotiable consolidation rules

1. One canonical authority per capability; Zeus wins unless a documented defect
   requires migration.
2. Donor code is never copied wholesale.
3. Hermes substantial code may only be copied after preserving MIT notices in
   `THIRD_PARTY_NOTICES.md`; conceptual reimplementation is recorded as such.
4. Proprietary competitor implementations are never copied; only publicly
   observable product behavior may inform independent Zeus UX.
5. A donor capability is not considered migrated until tests and the relevant
   runtime/security acceptance pass.
6. Legacy repositories remain intact until Zeus acceptance is complete; they are
   not parallel production authorities.
7. Every future imported subsystem must add a row with source path, source
   commit, license, Zeus destination, architectural reason, security review,
   tests, and migration status.