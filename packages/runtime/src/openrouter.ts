import {
  ProviderNotConfiguredError,
  RuntimeError,
  unconfiguredProvider,
  type ModelInput,
  type ModelMessage,
  type ModelOutput,
  type ModelProvider,
  type ModelToolCall,
  type ModelUsage,
} from "./index";

interface OpenRouterProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly appUrl?: string;
  readonly appName?: string;
  readonly endpoint?: string;
}

interface OpenRouterToolCall {
  readonly id?: unknown;
  readonly function?: {
    readonly name?: unknown;
    readonly arguments?: unknown;
  };
}

interface OpenRouterResponse {
  readonly model?: unknown;
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: unknown;
      readonly tool_calls?: readonly OpenRouterToolCall[];
    };
  }[];
  readonly usage?: {
    readonly prompt_tokens?: unknown;
    readonly completion_tokens?: unknown;
    readonly prompt_tokens_details?: { readonly cached_tokens?: unknown };
    readonly cost?: unknown;
  };
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
  calls: readonly OpenRouterToolCall[] | undefined,
): ModelToolCall[] {
  if (!calls?.length) return [];
  const mapping = new Map(
    (input.tools ?? []).map((tool) => [toolFunctionName(tool.id), tool.id] as const),
  );
  return calls.map((call, index) => {
    const id = typeof call.id === "string" && call.id ? call.id : `tool-${index}`;
    const functionName = call.function?.name;
    if (typeof functionName !== "string") {
      throw new RuntimeError("MODEL_ERROR", "Model returned a tool call without a function name.");
    }
    const toolId = mapping.get(functionName);
    if (!toolId) throw new RuntimeError("TOOL_NOT_FOUND", "Model requested an unknown tool.");
    const rawArguments = call.function?.arguments;
    if (typeof rawArguments !== "string") {
      throw new RuntimeError("TOOL_INPUT_INVALID", `Tool ${toolId} returned invalid arguments.`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawArguments);
    } catch {
      throw new RuntimeError(
        "TOOL_INPUT_INVALID",
        `Tool ${toolId} returned malformed JSON arguments.`,
      );
    }
    return { id, toolId, input: parsed };
  });
}

function usageOf(response: OpenRouterResponse, latencyMs: number): ModelUsage {
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

function providerError(status: number): RuntimeError {
  if (status === 401 || status === 403) {
    return new RuntimeError("PROVIDER_AUTH_FAILED", "AI provider authentication failed.");
  }
  if (status === 429) {
    return new RuntimeError("PROVIDER_RATE_LIMITED", "AI provider rate limit reached.", true);
  }
  if (status >= 500) {
    return new RuntimeError("MODEL_ERROR", "AI provider is temporarily unavailable.", true);
  }
  return new RuntimeError("MODEL_ERROR", `AI provider request failed with HTTP ${status}.`);
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

export function createOpenRouterProvider(options: OpenRouterProviderOptions): ModelProvider {
  const apiKey = options.apiKey.trim();
  const model = options.model.trim();
  if (!apiKey || !model) return unconfiguredProvider;
  const endpoint = options.endpoint ?? "https://openrouter.ai/api/v1/chat/completions";

  return {
    id: "openrouter",
    configured: true,
    capabilities: new Set(["stream", "tools", "structured_output", "usage", "cancellation"]),
    async generate(input, signal): Promise<ModelOutput> {
      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(options.appUrl ? { "HTTP-Referer": options.appUrl } : {}),
            ...(options.appName ? { "X-Title": options.appName } : {}),
          },
          body: JSON.stringify(requestBody(input, model)),
          signal,
        });
      } catch (error) {
        if (signal.aborted) throw new RuntimeError("RUN_CANCELLED", "Run cancelled.");
        if (error instanceof DOMException && error.name === "TimeoutError") {
          throw new RuntimeError("PROVIDER_TIMEOUT", "AI provider request timed out.", true);
        }
        throw new RuntimeError("MODEL_ERROR", "AI provider network request failed.", true);
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw providerError(response.status);
      }

      const raw: unknown = await response.json();
      if (!raw || typeof raw !== "object") {
        throw new RuntimeError("MODEL_ERROR", "AI provider returned an invalid response.");
      }
      const parsed = raw as OpenRouterResponse;
      const choice = parsed.choices?.[0]?.message;
      if (!choice)
        throw new RuntimeError("MODEL_ERROR", "AI provider returned no response choice.");
      const text = typeof choice.content === "string" ? choice.content : "";
      const toolCalls = parseToolCalls(input, choice.tool_calls);
      const responseModel = typeof parsed.model === "string" && parsed.model ? parsed.model : model;
      return {
        text,
        ...(toolCalls.length ? { toolCalls } : {}),
        provider: "openrouter",
        model: responseModel,
        usage: usageOf(parsed, Date.now() - startedAt),
      };
    },
    async *stream(input, signal) {
      if (input.tools?.length || input.structuredOutputSchema) {
        const output = await this.generate(input, signal);
        if (output.text) yield { textDelta: output.text };
        yield { usage: output.usage, done: true };
        return;
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(options.appUrl ? { "HTTP-Referer": options.appUrl } : {}),
          ...(options.appName ? { "X-Title": options.appName } : {}),
        },
        body: JSON.stringify({ ...requestBody(input, model), stream: true }),
        signal,
      });
      if (!response.ok) throw providerError(response.status);
      if (!response.body)
        throw new RuntimeError("MODEL_ERROR", "AI provider stream is unavailable.");
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
              throw new RuntimeError(
                "MODEL_ERROR",
                "AI provider returned an invalid stream chunk.",
              );
            }
          }
          boundary = buffer.indexOf("\n\n");
        }
      }
      yield { done: true };
    },
  };
}

export function createOpenRouterProviderFromEnv(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ModelProvider {
  const apiKey = environment.OPENROUTER_API_KEY?.trim();
  const model = environment.ZEUS_DEFAULT_MODEL?.trim();
  if (!apiKey || !model) return unconfiguredProvider;
  return createOpenRouterProvider({
    apiKey,
    model,
    ...(environment.ZEUS_APP_URL ? { appUrl: environment.ZEUS_APP_URL } : {}),
    appName: "Zeus",
  });
}

export function assertOpenRouterConfigured(provider: ModelProvider): void {
  if (!provider.configured) throw new ProviderNotConfiguredError();
}

export type { ModelMessage };
