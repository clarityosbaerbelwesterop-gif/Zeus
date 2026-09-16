# Kai repository scope

## Authority

Kai is a repository-agnostic coding agent. Zeus is the product repository, not
the only repository Kai may edit.

The security boundary is:

`user -> workspace -> connected GitHub authority -> workspace repository binding -> run -> isolated sandbox -> zeus/* work branch`

A valid repository binding may point at any GitHub `owner/repository` that the
workspace's connected GitHub authority is permitted to access. No runtime rule
may special-case `clarityosbaerbelwesterop-gif/Zeus` as the only editable
repository.

## Branch isolation

The `zeus/*` requirement is a branch namespace, not a repository allow-list.
Kai never edits `main`, `master`, `production`, or `prod` directly. A typical
customer run uses a branch such as `zeus/kai/task-<id>` inside the customer's
selected repository.

## Required invariants

1. Repository identity is validated as `owner/repository` before use.
2. Repository credentials belong to a connected GitHub connection in the same
   workspace.
3. Private repository access must fail closed when the connected authority
   cannot access the repository.
4. A coding run is pinned to one repository binding and exact base SHA for its
   execution lifetime.
5. Sandbox filesystem containment applies independently of repository identity.
6. Push and pull-request operations use the same repository binding that the run
   executed against.
7. Child/subagent work may narrow repository permissions but may not expand
   beyond the parent run's repository authority.
8. Direct protected-branch writes, force pushes, repository deletion,
   settings/secrets mutation, and other destructive repository operations are
   outside normal Kai coding authority and require stronger policy/approval.
9. Cross-workspace and cross-tenant repository bindings must be rejected by RLS
   and application policy.
10. Repository access must be revalidated at consequential external-action time;
    a stale connection must not be treated as connected.

## Current implementation

`packages/runtime/src/m4-boundaries.ts` validates arbitrary GitHub repository
identities and reserves `zeus/*` for isolated work branches.
`apps/web/lib/kai-coding-tools.ts` persists workspace-scoped repository
bindings, creates isolated sandbox sessions, verifies the active feature branch,
and requires explicit change requests before remote push / pull-request side
effects.

The V1 acceptance suite must retain repository-agnostic tests so a future
refactor cannot accidentally turn the branch namespace into a Zeus-repository
restriction.
