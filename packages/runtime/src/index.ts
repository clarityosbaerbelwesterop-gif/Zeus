import type { AgentCode } from "@zeus/agents";
import type { RunStatus } from "@zeus/shared";

export interface ModelInput {
  readonly system: string;
  readonly messages: readonly {
    readonly role: "user" | "assistant";
    readonly content: string;
  }[];
}

export interface ModelOutput {
  readonly text: string;
  readonly provider: string;
  readonly model: string;
}

export interface ModelProvider {
  readonly id: string;
  readonly configured: boolean;
  generate(input: ModelInput, signal: AbortSignal): Promise<ModelOutput>;
}

export interface RunRecorder {
  start(input: {
    workspaceId: string;
    conversationId: string;
    agent: AgentCode;
    objective: string;
  }): Promise<{ id: string }>;
  step(
    runId: string,
    input: { status: RunStatus; title: string; tool?: string; safeDetail?: string },
  ): Promise<void>;
  finish(
    runId: string,
    status: Extract<RunStatus, "completed" | "failed" | "cancelled" | "waiting">,
  ): Promise<void>;
}

export class ProviderNotConfiguredError extends Error {
  constructor() {
    super("AI provider not configured yet.");
    this.name = "ProviderNotConfiguredError";
  }
}

export const unconfiguredProvider: ModelProvider = {
  id: "unconfigured",
  configured: false,
  generate() {
    return Promise.reject(new ProviderNotConfiguredError());
  },
};
