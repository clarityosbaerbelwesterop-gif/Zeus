# Zeus Final Pre-Billing Execution Matrix

Audit baseline: `main` at `73bf93299c3f5ee47941a817d1482ce6f6318b6d` (merged M5).

This is a reality-based execution matrix, not a completion claim. A layer is COMPLETE only after its relevant runtime/infrastructure verification succeeds.

| Area                            | State    | Evidence / required work                                                                                                                                                               |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 Foundation                   | COMPLETE | Merged foundation and canonical monorepo/auth/db boundaries.                                                                                                                           |
| M2 Workspace OS                 | COMPLETE | Canonical workspace/task/plan/artifact/memory authorities merged.                                                                                                                      |
| M3 Agent Runtime                | COMPLETE | Canonical Run/RunStep/RunEvent/ToolRegistry runtime merged and CI-verified.                                                                                                            |
| M4 Kai Coding                   | COMPLETE | Isolated sandbox/repository execution authority merged and CI-verified.                                                                                                                |
| M5 Connected Apps foundation    | PARTIAL  | CredentialVault/OAuth/MCP security foundations merged; live provider verification remains configuration-dependent.                                                                     |
| M6 Multi-Agent Collaboration    | MISSING  | Implement TeamRun over canonical Runs, DAG dependencies, bounded parallelism, handoffs, review/rework and UI.                                                                          |
| M7 Deep Agent Specialization    | PARTIAL  | Agent definitions exist; production specialization, policies, verification and model routing require completion.                                                                       |
| M8 Automations                  | MISSING  | Add canonical durable automation authority that creates Runs/TeamRuns; no second runtime.                                                                                              |
| M9 Security/Evals/Observability | PARTIAL  | Existing RLS/runtime/M4/M5 security boundaries exist; full threat model, eval suite, abuse limits and audit remain.                                                                    |
| M10 Production Polish           | PARTIAL  | Landing/workspace/auth exist; onboarding, connected/team/automation surfaces, responsive/accessibility and launch verification remain.                                                 |
| Neon                            | BROKEN   | Canonical project `aged-mode-27990486` is reachable, but production/default branch currently exposes `neon_auth` and not the `zeus` schema. Production migration is a release blocker. |
| Vercel                          | BLOCKED  | Connected Vercel team currently exposes no project linked to `clarityosbaerbelwesterop-gif/Zeus`; do not create a duplicate until canonical project ownership is resolved.             |
| UNOROUTER                       | MISSING  | Existing runtime adapter is OpenRouter-specific. Implement dedicated provider only after real UNOROUTER API contract is verified; never send UNOROUTER keys to OpenRouter.             |
| Auth                            | PARTIAL  | Neon Auth routes exist; production browser/session verification requires migrated DB and canonical deployment.                                                                         |
| RLS                             | PARTIAL  | Versioned migrations include RLS/FORCE RLS and CI tests; production cannot pass until canonical migrations are applied and direct cross-tenant denial is re-run there.                 |
| CI/CD                           | PARTIAL  | Canonical CI exists; final M6-M10 suite/security/evals/production gates must be added and pass.                                                                                        |
| Preview                         | BLOCKED  | Canonical Vercel project/Preview is not visible through current connected Vercel team.                                                                                                 |
| Production                      | BLOCKED  | Production DB schema missing and canonical Vercel project not visible.                                                                                                                 |

## Hard release blockers discovered in audit

1. Neon production/default branch lacks the `zeus` application schema. Apply only repository migrations, after verification on a safe branch.
2. No Zeus Vercel project is visible in the currently connected Vercel team. Do not create a duplicate without proving the reported Preview is not canonical/accessible.
3. UNOROUTER's real API contract and endpoint must be verified before a provider adapter or live provider claim is made. Existing `openrouter.ts` must not receive `UNOROUTER_API_KEY_*`.
4. M6-M10 product/runtime work is not yet present on `main` and must be implemented on the finalization branch.

## Execution order

1. Preserve M1-M5 authorities and repair infrastructure blockers safely.
2. Implement M6 TeamRun orchestration over Runs/Tasks/Plans.
3. Implement M7 centralized specialist policies/model aliases.
4. Implement M8 durable automations over Runs/TeamRuns.
5. Implement M9 threat model, deterministic/red-team evals, abuse limits, observability and workflow hardening.
6. Implement M10 onboarding/navigation/UX/responsive/accessibility/error polish.
7. Run canonical CI/security/migration/RLS/E2E gates.
8. Verify Preview, then production, then merge final PR only when gates are truthful.
