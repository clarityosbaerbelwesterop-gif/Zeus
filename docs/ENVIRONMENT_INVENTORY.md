# Zeus Environment Inventory

No secret values belong in this document. Server-only values must never use `NEXT_PUBLIC_*`.

| Variable | Required | Scope | Development | Preview | Production | Source / destination | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DATABASE_URL` | yes for app DB | server | local/test Postgres | canonical Neon Preview/test target | canonical Zeus Neon | secret → Vercel server runtime | pooled application DB connection |
| `DATABASE_URL_UNPOOLED` | migrations/admin only | server | optional | migration workflow only | migration workflow only | secret → protected workflow/server | direct migration/admin connection |
| `NEON_AUTH_BASE_URL` | yes | server | dev auth endpoint | Preview callback endpoint | Production callback endpoint | variable → Vercel | Neon Auth service endpoint |
| `NEON_AUTH_COOKIE_SECRET` | yes | server | local secret | Preview secret | Production secret | GitHub/Vercel secret | session cookie signing/encryption |
| `UNOROUTER_API_KEY_1` | yes for AI | server | optional developer key | required | required | GitHub/Vercel secret | primary UnoRouter credential |
| `UNOROUTER_API_KEY_2` | recommended | server | optional | recommended | recommended | GitHub/Vercel secret | bounded fallback credential |
| `ZEUS_DEFAULT_MODEL` | yes for AI | server | configured model ID | configured model ID | configured model ID | variable → Vercel | default UnoRouter model |
| `ZEUS_FAST_MODEL` | optional | server | optional | optional | optional | variable → Vercel | fast model alias |
| `ZEUS_STRONG_MODEL` | optional | server | optional | optional | optional | variable → Vercel | strong model alias |
| `ZEUS_CODING_MODEL` | optional | server | optional | optional | optional | variable → Vercel | Kai model alias |
| `ZEUS_MANAGER_MODEL` | optional | server | optional | optional | optional | variable → Vercel | Jorge model alias |
| `ZEUS_DESIGN_MODEL` | optional | server | optional | optional | optional | variable → Vercel | Lora model alias |
| `ZEUS_TEST_MODEL` | optional | server | optional | optional | optional | variable → Vercel | Simon model alias |
| `ZEUS_SALES_MODEL` | optional | server | optional | optional | optional | variable → Vercel | Sara model alias |
| `ZEUS_APP_URL` | recommended | server | localhost | Preview origin | Production origin | variable → Vercel | canonical application origin |
| `ZEUS_PUBLIC_ORIGIN` | optional compatibility | server | localhost | Preview origin | Production origin | variable → Vercel | origin checks |
| `ZEUS_CREDENTIAL_KEY_VERSION` | required for connected credentials | server | local | required when M5 enabled | required when M5 enabled | variable → Vercel | active vault key version |
| `ZEUS_CREDENTIAL_KEY_V1` | required for M5 vault | server | local secret | secret | secret | GitHub/Vercel secret | AES-256-GCM vault master material; never stored in Neon |
| `OPENROUTER_API_KEY` | optional legacy provider only | server | optional | optional | optional | secret → Vercel only if explicitly used | optional OpenRouter adapter; never receives UnoRouter keys |

M4 sandbox and M5 OAuth/MCP provider variables remain configuration-dependent and must be added here only when the corresponding concrete provider implementation consumes them. Repository secrets must not be enumerated and copied blindly. Neon stores application data and encrypted credential envelopes, not arbitrary raw service secrets.
