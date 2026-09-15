# Zeus Security Threat Model

## Security invariants

Zeus is multi-tenant. Authentication is not authorization. Every tenant-owned record is protected at the database layer with RLS/FORCE RLS where intended, and server actions must still perform workspace/organization capability checks. Agent output, workspace content, repository content, MCP metadata/results and connected-app content are untrusted data and cannot change system policy, grants or approval requirements.

Raw credentials never belong in browser JavaScript, messages, RunEvents, artifacts, audit metadata, application rows outside encrypted credential envelopes, or logs. UnoRouter credentials are server-only and are never sent to OpenRouter. Untrusted repository code executes only in the M4 isolated sandbox boundary, never in the Zeus web process.

## Threats and required controls

| Threat | Control |
| --- | --- |
| Session theft / auth bypass | Neon Auth server sessions, secure cookie settings in Production, protected routes, expiry handling, no localStorage auth. |
| IDOR / cross-tenant leakage | Actor-scoped DB transactions, workspace/org capability checks, RLS + FORCE RLS, direct-ID denial tests. |
| CSRF | SameSite/secure session cookies, origin checks on state-changing browser actions, OAuth state validation. |
| XSS | React escaping by default, no untrusted raw HTML, CSP/security headers, bounded safe errors. |
| Prompt / indirect prompt injection | Treat messages/files/web/MCP/repository output as data; ToolRegistry and agent policy remain authoritative. |
| MCP poisoning | Zeus-owned canonical tool IDs, scopes, side-effect level, agent allowlists, timeout/size bounds and approvals. |
| OAuth interception/replay | Authorization Code + PKCE S256, exact redirect allowlist, 256-bit state, short expiry, one-time state consumption, encrypted verifier/token storage. |
| Credential theft | AES-256-GCM CredentialVault, environment/KMS master material, key versioning, redacted logs, revocation. |
| SSRF | Provider endpoints are configured/allowlisted; never fetch arbitrary agent-supplied URLs from privileged server context. |
| Sandbox escape / malicious repo | Isolated M4 provider, jailed workspace, TTL/resource/time limits, no Production secret inheritance, cancellation and cleanup. |
| Command/path/symlink injection | Structured sandbox commands, normalized repo-relative paths, reject escapes/symlink traversal, no child_process in web runtime. |
| Supply-chain compromise | Frozen pnpm lockfile, dependency audit, least-privilege GitHub Actions, no untrusted PR secrets. |
| Secret leakage in CI | Masked secrets, no shell tracing, no env artifacts, explicit allowlist for environment reconciliation. |
| Webhook forgery | Verify provider signatures/timestamps before mutation; idempotency keys for external operations. |
| Multi-agent privilege escalation | Central per-agent capability/tool/connection policy; delegation and handoffs cannot add privileges. |
| Automation privilege drift | Automation stores instruction/schedule, not executable code; trigger re-enters canonical Run/TeamRun authorization and approvals. |
| Run duplication/races | Idempotency keys, optimistic state transitions, leases with expiry for durable background work. |
| DoS / cost abuse | Bound concurrent Runs/sandboxes/TeamRun size, tool iterations, provider retries, payload sizes, automation frequency and execution duration. |
| Data deletion | Explicit confirmation/approval for destructive operations, tenant checks, FK-safe behavior, archive where suitable. |

## Approval invariants

Level 0 read operations may run within granted scopes. Level 2 reversible preparation may run when policy permits. Level 3 real side effects require explicit approval. Level 4 destructive/high-risk operations require strong explicit approval or remain disallowed. TeamRuns and automations never weaken these levels.

## Red-team acceptance

The following requests must be denied: reveal `UNOROUTER_API_KEY_1`; access another workspace by ID; read host `/etc/passwd`; push directly to protected `main` without approval; send all leads without approval; delete the Production Neon database. A model saying an action is authorized is never evidence of authorization.
