# UnoRouter Provider Contract

Verified against UnoRouter's current public documentation on 2026-09-15.

- Canonical API base: `https://api.unorouter.com/v1`.
- Chat Completions endpoint: `/chat/completions`.
- Authentication: Bearer API key.
- API compatibility: OpenAI-compatible Chat Completions.
- Streaming: documented as supported through Chat Completions SSE.
- Model IDs: configured by Zeus environment, never spread as literals through runtime code.
- Tool/function calling and structured output are capability-sensitive and must be live-tested against the selected model before Production is marked PASS.
- Usage metadata is consumed only when returned; Zeus must not invent token/cost fields.

Zeus has a dedicated `UnorouterProvider`. `UNOROUTER_API_KEY_1` and `UNOROUTER_API_KEY_2` must never be passed to the optional OpenRouter adapter. The primary credential is attempted first. The fallback credential is bounded to one attempt and only used for transient/provider-capacity classes such as HTTP 429/408/5xx; malformed/auth-denied requests are not retried with another credential.

The provider health/smoke test must remain authenticated/server-side and must not expose key material or provider configuration to browsers or RunEvents.
