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

export type UnoRouterCredentialSlot = "primary" | "fallback";
export type UnoRouterModelSlot = "primary" | "fallback";
type DeclaredCapability = "stream" | "tools" | "structured_output" | "usage" | "cancellation";

export const DEFAULT_UNOROUTER_MODEL = "glm-5.3";
export const DEFAULT_UNOROUTER_FALLBACK_MODEL = "claude-opus-5";

const VERIFIED_AGENT_MODELS = new Set([
  DEFAULT_UNOROUTER_MODEL,
  DEFAULT_UNOROUTER_FALLBACK_MODEL,
]);

export interface UnoRouterProviderOptions {
  readonly primaryApiKey: string;
  readonly fallbackApiKey?: string;
  readonly model: string;
  readonly fallbackModel?: string;
  readonly endpoint?: string;
  readonly fetchImpl?: typeof fetch;
  readonly capabilities?: ReadonlySet<DeclaredCapability>;
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
  readonly error?: { readonly code?: unknown; readonly message?: unknown };
}

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

function parseToolCalls(
  input: ModelInput,
  calls: readonly UnoRouterToolCall[] | undefined,
): ModelToolCall[] {
  if (!calls?.length) return [];
  const mapping = new Map(
    (input.tools ?? []).map((tool) => [toolFunctionName(tool.id), tool.id] as const),
  );
  return calls.map((call, index) => {
    const id = typeof call.id === "string" && call.id ? call.id : `tool-${index}`;
    const functionName = call.function?.name;
    if (typeof functionName !== "string") {
      throw new RuntimeError(
        "MODEL_ERROR",
        "UnoRouter returned a tool call without a function name.",
      );
    }
    const toolId = mapping.get(functionName);
    if (!toolId) throw new RuntimeError("TOOL_NOT_FOUND", "UnoRouter requested an unknown tool.");
    const rawArguments = call.function?.arguments;
    if (typeof rawArguments !== "string") {
      throw new RuntimeError("TOOL_INPUT_INVALID", `Tool ${toolId} returned invalid arguments.`);
    }
    try {
      return { id, toolId, input: JSON.parse(rawArguments) as unknown };
    } catch {
      throw new RuntimeError(
        "TOOL_INPUT_INVALID",
        `Tool ${toolId} returned malformed JSON arguments.`,
      );
    }
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
            json_schema: {
              name: "zeus_output",
              strict: true,
              schema: input.structuredOutputSchema,
            },
          },
        }
      : {}),
  };
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(30_000, Math.ceil(seconds * 1_000));
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(30_000, Math.max(0, date - Date.now())) : undefined;
}

async function errorCodeOf(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as UnoRouterResponse;
    return typeof body.error?.code === "string" ? body.error.code : undefined;
  } catch {
    return undefined;
  }
}

function providerError(status: number, code?: string): RuntimeError {
  if (status === 401 || status === 403) {
    return new RuntimeError(
      "PROVIDER_AUTH_FAILED",
      "UnoRouter authentication or authorization failed.",
    );
  }
  if (status === 402) {
    return new RuntimeError(
      "PROVIDER_AUTH_FAILED",
      "UnoRouter credential spending limit was reached.",
    );
  }
  if (status === 429) {
    return new RuntimeError("PROVIDER_RATE_LIMITED", "UnoRouter rate limit reached.", true);
  }
  if (status === 503 && code === "model_not_found") {
    return new RuntimeError(
      "MODEL_ERROR",
      "The configured UnoRouter model does not exist or is unavailable for this credential.",
    );
  }
  if (status === 408 || status >= 500) {
    return new RuntimeError("MODEL_ERROR", "UnoRouter is temporarily unavailable.", true);
  }
  return new RuntimeError("MODEL_ERROR", `UnoRouter request failed with HTTP ${status}.`);
}

function mayUseNextCredential(status: number, code?: string): boolean {
  if (status === 401 || status === 403 || status === 402 || status === 408 || status === 429) {
    return true;
  }
  return status >= 500 && !(status === 503 && code === "model_not_found");
}

function mayUseFallbackModel(status: number, code?: string): boolean {
  if (status === 408 || status === 429) return true;
  return status >= 500 || (status === 503 && code === "model_not_found");
}

async function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new RuntimeError("RUN_CANCELLED", "Run cancelled."));
      },
      { once: true },
    );
  });
}

function capabilitiesForModels(models: readonly string[]): Set<DeclaredCapability> {
  const result = new Set<DeclaredCapability>(["stream", "usage", "cancellation"]);
  if (models.length > 0 && models.every((model) => VERIFIED_AGENT_MODELS.has(model))) {
    result.add("tools");
    result.add("structured_output");
  }
  return result;
}

function capabilitiesFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  models: readonly string[],
): ReadonlySet<DeclaredCapability> {
  const result = capabilitiesForModels(models);
  const requested =
    environment.ZEUS_UNOROUTER_CAPABILITIES?.split(",")
      .map((item) => item.trim())
      .filter(Boolean) ?? [];
  for (const capability of requested) {
    if (["stream", "tools", "structured_output", "usage", "cancellation"].includes(capability)) {
      result.add(capability as DeclaredCapability);
    }
  }
  return result;
}

export function createUnoRouterProvider(options: UnoRouterProviderOptions): ModelProvider {
  const primary = options.primaryApiKey.trim();
  const fallback = options.fallbackApiKey?.trim();
  const model = options.model.trim();
  const fallbackModel = options.fallbackModel?.trim();
  if (!primary || !model) return unconfiguredProvider;
  const endpoint = options.endpoint ?? "https://api.unorouter.com/v1/chat/completions";
  const fetcher = options.fetchImpl ?? fetch;
  const models: readonly { slot: UnoRouterModelSlot; name: string }[] =
    fallbackModel && fallbackModel !== model
      ? [
          { slot: "primary", name: model },
          { slot: "fallback", name: fallbackModel },
        ]
      : [{ slot: "primary", name: model }];
  const capabilities =
    options.capabilities ?? capabilitiesForModels(models.map((candidate) => candidate.name));
  const credentials: readonly { slot: UnoRouterCredentialSlot; key: string }[] =
    fallback && fallback !== primary
      ? [
          { slot: "primary", key: primary },
          { slot: "fallback", key: fallback },
        ]
      : [{ slot: "primary", key: primary }];

  async function rawRequest(
    input: ModelInput,
    signal: AbortSignal,
    stream = false,
  ): Promise<{
    response: Response;
    slot: UnoRouterCredentialSlot;
    modelSlot: UnoRouterModelSlot;
    model: string;
    startedAt: number;
  }> {
    if (input.tools?.length && !capabilities.has("tools")) {
      throw new RuntimeError(
        "MODEL_ERROR",
        "The configured UnoRouter model has not been declared tool-capable.",
      );
    }
    if (input.structuredOutputSchema && !capabilities.has("structured_output")) {
      throw new RuntimeError(
        "MODEL_ERROR",
        "The configured UnoRouter model has not been declared structured-output capable.",
      );
    }

    let lastError: RuntimeError | undefined;
    modelLoop: for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
      const candidate = models[modelIndex]!;
      for (let credentialIndex = 0; credentialIndex < credentials.length; credentialIndex += 1) {
        const credential = credentials[credentialIndex]!;
        const startedAt = Date.now();
        let response: Response;
        try {
          response = await fetcher(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${credential.key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...requestBody(input, candidate.name),
              ...(stream ? { stream: true } : {}),
            }),
            signal,
          });
        } catch (error) {
          if (signal.aborted) throw new RuntimeError("RUN_CANCELLED", "Run cancelled.");
          const networkError =
            error instanceof DOMException && error.name === "TimeoutError"
              ? new RuntimeError("PROVIDER_TIMEOUT", "UnoRouter request timed out.", true)
              : new RuntimeError("MODEL_ERROR", "UnoRouter network request failed.", true);
          lastError = networkError;
          if (credentialIndex + 1 < credentials.length) continue;
          if (modelIndex + 1 < models.length) continue modelLoop;
          throw networkError;
        }

        if (response.ok) {
          return {
            response,
            slot: credential.slot,
            modelSlot: candidate.slot,
            model: candidate.name,
            startedAt,
          };
        }

        const code = await errorCodeOf(response);
        const failure = providerError(response.status, code);
        lastError = failure;
        const retryDelay = response.status === 429 ? retryAfterMs(response) : undefined;
        await response.body?.cancel().catch(() => undefined);

        if (response.status === 503 && code === "model_not_found") {
          if (modelIndex + 1 < models.length) continue modelLoop;
          throw failure;
        }

        if (
          credentialIndex + 1 < credentials.length &&
          mayUseNextCredential(response.status, code)
        ) {
          if (retryDelay !== undefined) await wait(retryDelay, signal);
          continue;
        }

        if (modelIndex + 1 < models.length && mayUseFallbackModel(response.status, code)) {
          if (retryDelay !== undefined) await wait(retryDelay, signal);
          continue modelLoop;
        }

        throw failure;
      }
    }
    throw lastError ?? new RuntimeError("MODEL_ERROR", "UnoRouter request failed.");
  }

  return {
    id: "unorouter",
    configured: true,
    capabilities,
    async generate(input, signal): Promise<ModelOutput> {
      const { response, slot, model: servedModel, startedAt } = await rawRequest(input, signal);
      const raw: unknown = await response.json();
      if (!raw || typeof raw !== "object") {
        throw new RuntimeError("MODEL_ERROR", "UnoRouter returned an invalid response.");
      }
      const parsed = raw as UnoRouterResponse;
      const choice = parsed.choices?.[0]?.message;
      if (!choice) throw new RuntimeError("MODEL_ERROR", "UnoRouter returned no response choice.");
      const text = typeof choice.content === "string" ? choice.content : "";
      const toolCalls = parseToolCalls(input, choice.tool_calls);
      const responseModel =
        typeof parsed.model === "string" && parsed.model ? parsed.model : servedModel;
      return {
        text,
        ...(toolCalls.length ? { toolCalls } : {}),
        provider: `unorouter:${slot}`,
        model: responseModel,
        usage: usageOf(parsed, Date.now() - startedAt),
      };
    },
    async *stream(input, signal) {
      if (!capabilities.has("stream")) {
        throw new RuntimeError(
          "MODEL_ERROR",
          "The configured UnoRouter model has not been declared streaming-capable.",
        );
      }
      if (input.tools?.length || input.structuredOutputSchema) {
        const output = await this.generate(input, signal);
        if (output.text) yield { textDelta: output.text };
        yield { usage: output.usage, done: true };
        return;
      }
      const { response } = await rawRequest(input, signal, true);
      if (!response.body) throw new RuntimeError("MODEL_ERROR", "UnoRouter stream is unavailable.");
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of event.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const chunk = JSON.parse(data) as {
                choices?: readonly { delta?: { content?: unknown } }[];
              };
              const delta = chunk.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta) yield { textDelta: delta };
            } catch {
              throw new RuntimeError("MODEL_ERROR", "UnoRouter returned an invalid stream chunk.");
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
      yield { done: true };
    },
  };
}

export function createUnoRouterProviderFromEnv(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  modelOverride?: string,
): ModelProvider {
  const primaryApiKey = environment.UNOROUTER_API_KEY_1?.trim();
  const fallbackApiKey = environment.UNOROUTER_API_KEY_2?.trim();
  const model =
    modelOverride?.trim() || environment.ZEUS_DEFAULT_MODEL?.trim() || DEFAULT_UNOROUTER_MODEL;
  const fallbackModel =
    environment.ZEUS_FALLBACK_MODEL?.trim() || DEFAULT_UNOROUTER_FALLBACK_MODEL;
  if (!primaryApiKey) return unconfiguredProvider;
  const models = fallbackModel !== model ? [model, fallbackModel] : [model];
  return createUnoRouterProvider({
    primaryApiKey,
    ...(fallbackApiKey ? { fallbackApiKey } : {}),
    model,
    ...(fallbackModel !== model ? { fallbackModel } : {}),
    capabilities: capabilitiesFromEnvironment(environment, models),
  });
}

export function assertUnoRouterConfigured(provider: ModelProvider): void {
  if (!provider.configured) throw new ProviderNotConfiguredError();
}
