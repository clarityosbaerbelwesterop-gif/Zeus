# PRODUCT M5 — Connected Apps / OAuth / MCP

Base: merged M4 `5c072ccbda776d99bda8ddb7c27d4c3bd3721b16`.

## Architecture

M5 extends the existing `zeus.connections` authority. It adds workspace grants, credential metadata, one-time OAuth state, MCP session evidence and idempotent external-operation evidence. Raw provider credentials are encrypted server-side with AES-256-GCM through a versioned `CredentialVault`; master key material is environment/KMS-side and never stored in PostgreSQL.

OAuth uses Authorization Code + PKCE S256 where supported, exact allow-listed redirects, random 256-bit state, short expiry and one-time consumption. Scope escalation is explicit. Workspace grants and per-agent tool policy are separate from credential ownership.

MCP metadata and output are untrusted. Zeus owns canonical tool IDs, scope requirements, agent permissions, side-effect level, approval requirement, timeout and response-size bounds. Level 3/4 external actions cannot be registered without approval. Standard transports are `stdio` and Streamable HTTP; legacy standalone SSE is not a new M5 transport.

## Upstream review (2026-09-15)

- GitHub: official `github/github-mcp-server`, MIT. Use as capability/reference boundary; M4 remains the coding/repository authority.
- MCP: current specification uses stdio and Streamable HTTP. Current SDK supports modern 2026-07-28 and legacy negotiation; do not build new work on deprecated HTTP+SSE.
- Google Workspace: `taylorwilsdon/google_workspace_mcp`, MIT, broad Google OAuth surface. Treat as third-party and constrain scopes/tool policy in Zeus.
- Vercel: inspect `vercel-labs/mcp-on-vercel` and prefer current Vercel-supported interfaces. Production deployment remains Level 4.
- Neon: prefer Neon's official MCP server/current API boundary. Production schema/destructive actions remain approval-bound or disabled.
- LinkedIn: `stickerdaniel/linkedin-mcp-server` is third-party. Enable only capabilities that are actually supported by the deployment and LinkedIn terms; never synthesize messaging/posting capability.

## Live-provider truthfulness

Provider adapters are configuration-dependent. Unit/integration tests use deterministic boundaries. A provider is **BLOCKED**, not PASS, until its real OAuth/app credentials, endpoint and a successful live verification are present. M5 must never substitute mocks for a live-provider completion claim.
