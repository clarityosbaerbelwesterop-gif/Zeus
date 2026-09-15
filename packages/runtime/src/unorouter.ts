import {
  ProviderNotConfiguredError,
  RuntimeError,
  unconfiguredProvider,
  type ModelInput,
  type ModelOutput,
  type ModelProvider,
  type ModelToolCall,
  type ModelUsage,
} from "./index";

export interface UnoRouterProviderOptions {
  readonly primaryApiKey: string;
  readonly fallbackApiKey?: string;
  readonly model: string;
  readonly endpoint?: string;
  readonly fetchImpl?: typeof fetch;
}

interface UnoRouterToolCall {
  readonly id?: unknown;
  readonly function?: { readonly name?: unknown; readonly arguments?: unknown };
}

interface UnoRouterResponse {
  readonly model?: unknown;
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: unknown;
      readonly tool_calls?: readonly UnoRouterToolCall[];
    };
  }[];
  readonly usage?: {
    readonly prompt_tokens?: unknown;
    readonly completion_tokens?: unknown;
    readonly prompt_tokens_details?: { readonly cached_tokens?: unknown };
    readonly cost?: unknown;
  };
}

export type UnoRouterCredentialSlot = "primary" | "fallback";

function toolFunctionName(toolId: string): string {
  return `zeus_${toolId.replace(/[^a-zA-Z0-9_-]/gu, "__")}`.slice(0, 64);
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function mappedMessages(input: ModelInput): unknown[] {
  const messages: unknown[] = [{ role: "system", content: input.system }];
  for (const message of input.messages) {
    if (message.role === "assistant" && message.toolCalls?.length) {
      messages.push({
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: "function",
          function: {
            name: toolFunctionName(call.toolId),
            arguments: JSON.stringify(call.input),
          },
        })),
      });
      continue;
    }
    if (message.role === "tool") {
      if (!message.toolCallId) {
        throw new RuntimeError("MODEL_ERROR", "Tool result is missing its tool-call identity.");
      }
      messages.push({ role: "tool", content: message.content, tool_call_id: message.toolCallId });
      continue;
    }
    messages.push({ role: message.role, content: message.content });
  }
  return messages;
}

function parseToolCalls(input: ModelInput, calls: readonly UnoRouterToolCall[] | undefined): ModelToolCall[] {
  if (!calls?.length) return [];
  const mapping = new Map(
    (input.tools ?? []).map((tool) => [toolFunctionName(tool.id), tool.id] as const),
  );
  return calls.map((call, index) => {
    const id = typeof call.id === "string" && call.id ? call.id : `tool-${index}`;
    const functionName = call.function?.name;
    if (typeof functionName !== "string") {
      throw new RuntimeError("MODEL_ERROR", "UnoRouter returned a tool call without a function name.");
    }
    const toolId = mapping.get(functionName);
    if (!toolId) throw new RuntimeError("TOOL_NOT_FOUND", "UnoRouter requested an unknown tool.");
    const rawArguments = call.function?.arguments;
    if (typeof rawArguments !== "string") {
      throw new RuntimeError("TOOL_INPUT_INVALID", `Tool ${toolId} returned invalid arguments.`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawArguments);
    } catch {
      throw new RuntimeError("TOOL_INPUT_INVALID", `Tool ${toolId} returned malformed JSON arguments.`);
    }
    return { id, toolId, input: parsed };
  });
}

function usageOf(response: UnoRouterResponse, latencyMs: number): ModelUsage {
  const inputTokens = integer(response.usage?.prompt_tokens);
  const outputTokens = integer(response.usage?.completion_tokens);
  const cachedTokens = integer(response.usage?.prompt_tokens_details?.cached_tokens);
  const estimatedCost = numberValue(response.usage?.cost);
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(cachedTokens === undefined ? {} : { cachedTokens }),
    ...(estimatedCost === undefined ? {} : { estimatedCost }),
    latencyMs,
  };
}

function requestBody(input: ModelInput, model: string): Record<string, unknown> {
  return {
    model,
    messages: mappedMessages(input),
    ...(input.tools?.length
      ? {
          tools: input.tools.map((tool) => ({
            type: "function",
            function: {
              name: toolFunctionName(tool.id),
              description: tool.description,
              parameters: tool.inputSchema,
            },
          })),
          tool_choice: "auto",
        }
      : {}),
    ...(input.structuredOutputSchema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: { name: "zeus_output", strict: true, schema: input.structuredOutputSchema },
          },
        }
      : {}),
  };
}

function retryWithFallback(status: number): boolean {
  return status === 429 || status === 408 || status === 409 || status >= 500;
}

function providerError(status: number): RuntimeError {
  if (status === 401 || status === 403) {
    return new RuntimeError("PROVIDER_AUTH_FAILED", "UnoRouter authentication failed.");
  }
  if (status === 429) {
    return new RuntimeError("PROVIDER_RATE_LIMITED", "UnoRouter rate limit reached.", true);
  }
  if (status === 408 || status >= 500) {
    return new RuntimeError("MODEL_ERROR", "UnoRouter is temporarily unavailable.", true);
  }
  return new RuntimeError("MODEL_ERROR", `UnoRouter request failed with HTTP ${status}.`);
}

export function createUnoRouterProvider(options: UnoRouterProviderOptions): ModelProvider {
  const primary = options.primaryApiKey.trim();
  const fallback = options.fallbackApiKey?.trim();
  const model = options.model.trim();
  if (!primary || !model) return unconfiguredProvider;
  const endpoint = options.endpoint ?? "https://api.unorouter.com/v1/chat/completions";
  const fetcher = options.fetchImpl ?? fetch;

  async function request(input: ModelInput, signal: AbortSignal): Promise<ModelOutput> {
    const startedAt = Date.now();
    const credentials: readonly { slot: UnoRouterCredentialSlot; key: string }[] = fallback
      ? [
          { slot: "primary", key: primary },
          { slot: "fallback", key: fallback },
        ]
      : [{ slot: "primary", key: primary }];

    for (let index = 0; index < credentials.length; index += 1) {
      const credential = credentials[index]!;
      let response: Response;
      try {
        response = await fetcher(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${credential.key}`, "Content-Type": "application/json" },
          body: JSON.stringify(requestBody(input, model)),
          signal,
        });
      } catch (error) {
        if (signal.aborted) throw new RuntimeError("RUN_CANCELLED", "Run cancelled.");
        if (index + 1 < credentials.length) continue;
        if (error instanceof DOMException && error.name === "TimeoutError") {
          throw new RuntimeError("PROVIDER_TIMEOUT", "UnoRouter request timed out.", true);
        }
        throw new RuntimeError("MODEL_ERROR", "UnoRouter network request failed.", true);
      }
      if (!response.ok) {
        const canFallback = index + 1 < credentials.length && retryWithFallback(response.status);
        await response.body?.cancel().catch(() => undefined);
        if (canFallback) continue;
        throw providerError(response.status);
      }
      const raw: unknown = await response.json();
      if (!raw || typeof raw !== "object") {
        throw new RuntimeError("MODEL_ERROR", "UnoRouter returned an invalid response.");
      }
      const parsed = raw as UnoRouterResponse;
      const choice = parsed.choices?.[0]?.message;
      if (!choice) throw new RuntimeError("MODEL_ERROR", "UnoRouter returned no response choice.");
      const text = typeof choice.content === "string" ? choice.content : "";
      const toolCalls = parseToolCalls(input, choice.tool_calls);
      const responseModel = typeof parsed.model === "string" && parsed.model ? parsed.model : model;
      return {
        text,
        ...(toolCalls.length ? { toolCalls } : {}),
        provider: "unorouter",
        model: responseModel,
        usage: usageOf(parsed, Date.now() - startedAt),
      };
    }
    throw new RuntimeError("MODEL_ERROR", "UnoRouter request failed.", true);
  }

  return {
    id: "unorouter",
    configured: true,
    capabilities: new Set(["stream", "tools", "structured_output", "usage", "cancellation"]),
    generate: request,
    async *stream(input, signal) {
      if (input.tools?.length || input.structuredOutputSchema) {
        const output = await request(input, signal);
        if (output.text) yield { textDelta: output.text };
        yield { usage: output.usage, done: true };
        return;
      }
      const output = await request(input, signal);
      if (output.text) yield { textDelta: output.text };
      yield { usage: output.usage, done: true };
    },
  };
}

export function createUnoRouterProviderFromEnv(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ModelProvider {
  const primaryApiKey = environment.UNOROUTER_API_KEY_1?.trim();
  const fallbackApiKey = environment.UNOROUTER_API_KEY_2?.trim();
  const model = environment.ZEUS_DEFAULT_MODEL?.trim();
  if (!primaryApiKey || !model) return unconfiguredProvider;
  return createUnoRouterProvider({
    primaryApiKey,
    ...(fallbackApiKey ? { fallbackApiKey } : {}),
    model,
  });
}

export function assertUnoRouterConfigured(provider: ModelProvider): void {
  if (!provider.configured) throw new ProviderNotConfiguredError();
}
