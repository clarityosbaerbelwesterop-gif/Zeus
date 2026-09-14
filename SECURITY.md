# Zeus security model

Zeus M1 treats authentication, tenant isolation, credentials and agent actions as server-side authorities.

- Browser sessions are verified through Neon Managed Better Auth.
- Tenant-owned data is protected by PostgreSQL RLS with `FORCE ROW LEVEL SECURITY`.
- Application queries run inside short transactions that `SET LOCAL ROLE zeus_app` and bind the authenticated user through `set_config('zeus.user_id', ..., true)`.
- The browser never receives database credentials or provider secrets.
- Zeus API tokens are opaque 256-bit bearer tokens; only SHA-256 digests are persisted.
- Provider/OAuth secrets belong behind encrypted secret references, never ordinary connection metadata.
- External content and MCP tool descriptions are untrusted data, never permissions.
- Generated code will not execute inside the web process. Later isolated workers must sit behind the runtime/tool boundary.
- Audit metadata is intentionally secret-free.

Report vulnerabilities privately to the repository owner. Do not include live credentials in issues.
