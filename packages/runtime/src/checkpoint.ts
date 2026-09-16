import { createHash } from "node:crypto";
import type { RunStatus } from "@zeus/shared";
import { RuntimeError } from "./index";
import type { RuntimeUsageTotals } from "./budget";

export interface RuntimeCheckpointState {
  readonly runId: string;
  readonly sequence: number;
  readonly status: RunStatus;
  readonly toolCallCount: number;
  readonly consecutiveFailures: number;
  readonly usage: RuntimeUsageTotals;
  readonly safeCursor?: string;
}

export interface RuntimeCheckpoint {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly sequence: number;
  readonly snapshotHash: string;
  readonly state: RuntimeCheckpointState;
}

const terminalStatuses = new Set<RunStatus>(["completed", "failed", "cancelled"]);

function assertSafeInteger(value: number, label: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RuntimeError("INTERNAL_RUNTIME_ERROR", `Invalid checkpoint ${label}.`);
  }
}

function assertCheckpointState(state: RuntimeCheckpointState): void {
  if (!state.runId.trim() || state.runId.length > 256) {
    throw new RuntimeError("INTERNAL_RUNTIME_ERROR", "Invalid checkpoint run identity.");
  }
  assertSafeInteger(state.sequence, "sequence", 1);
  assertSafeInteger(state.toolCallCount, "tool call count");
  assertSafeInteger(state.consecutiveFailures, "failure count");
  assertSafeInteger(state.usage.modelCalls, "model call count");
  assertSafeInteger(state.usage.inputTokens, "input token count");
  assertSafeInteger(state.usage.outputTokens, "output token count");
  assertSafeInteger(state.usage.cachedTokens, "cached token count");
  if (!Number.isFinite(state.usage.estimatedCost) || state.usage.estimatedCost < 0) {
    throw new RuntimeError("INTERNAL_RUNTIME_ERROR", "Invalid checkpoint estimated cost.");
  }
  if (state.safeCursor !== undefined && state.safeCursor.length > 4_096) {
    throw new RuntimeError("INTERNAL_RUNTIME_ERROR", "Checkpoint cursor exceeds its safe bound.");
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, canonicalize(object[key])]),
  );
}

function hashState(state: RuntimeCheckpointState): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(state)))
    .digest("hex");
}

/**
 * Creates a minimal integrity-protected recovery checkpoint. It deliberately
 * excludes prompts, model messages, tool payloads, credentials and artifacts.
 */
export function createRuntimeCheckpoint(state: RuntimeCheckpointState): RuntimeCheckpoint {
  assertCheckpointState(state);
  const cloned = structuredClone(state);
  return Object.freeze({
    schemaVersion: 1,
    runId: cloned.runId,
    sequence: cloned.sequence,
    state: Object.freeze(cloned),
    snapshotHash: hashState(cloned),
  });
}

export function restoreRuntimeCheckpoint(
  checkpoint: RuntimeCheckpoint,
  expectedRunId: string,
): RuntimeCheckpointState {
  if (checkpoint.schemaVersion !== 1) {
    throw new RuntimeError("INTERNAL_RUNTIME_ERROR", "Unsupported runtime checkpoint schema.");
  }
  if (checkpoint.runId !== expectedRunId || checkpoint.state.runId !== expectedRunId) {
    throw new RuntimeError("INTERNAL_RUNTIME_ERROR", "Runtime checkpoint identity mismatch.");
  }
  if (checkpoint.sequence !== checkpoint.state.sequence) {
    throw new RuntimeError("INTERNAL_RUNTIME_ERROR", "Runtime checkpoint sequence mismatch.");
  }
  assertCheckpointState(checkpoint.state);
  if (hashState(checkpoint.state) !== checkpoint.snapshotHash) {
    throw new RuntimeError(
      "INTERNAL_RUNTIME_ERROR",
      "Runtime checkpoint integrity validation failed.",
    );
  }
  return structuredClone(checkpoint.state);
}

export function checkpointCanResume(state: RuntimeCheckpointState): boolean {
  assertCheckpointState(state);
  return !terminalStatuses.has(state.status);
}
