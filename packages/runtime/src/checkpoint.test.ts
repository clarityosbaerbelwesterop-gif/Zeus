import { describe, expect, it } from "vitest";
import {
  checkpointCanResume,
  createRuntimeCheckpoint,
  restoreRuntimeCheckpoint,
  type RuntimeCheckpointState,
} from "./checkpoint";

function state(overrides: Partial<RuntimeCheckpointState> = {}): RuntimeCheckpointState {
  return {
    runId: "run_123",
    sequence: 7,
    status: "running",
    toolCallCount: 3,
    consecutiveFailures: 0,
    usage: {
      modelCalls: 2,
      inputTokens: 120,
      outputTokens: 30,
      cachedTokens: 80,
      estimatedCost: 0.012,
    },
    safeCursor: "step:tool:3",
    ...overrides,
  };
}

describe("runtime recovery checkpoints", () => {
  it("round-trips a minimal integrity-protected checkpoint", () => {
    const original = state();
    const checkpoint = createRuntimeCheckpoint(original);
    const restored = restoreRuntimeCheckpoint(checkpoint, original.runId);

    expect(restored).toEqual(original);
    expect(checkpoint.snapshotHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(checkpoint.schemaVersion).toBe(1);
  });

  it("rejects a checkpoint restored under another run identity", () => {
    const checkpoint = createRuntimeCheckpoint(state());
    expect(() => restoreRuntimeCheckpoint(checkpoint, "run_other")).toThrow(/identity mismatch/i);
  });

  it("rejects tampering even when metadata still looks plausible", () => {
    const checkpoint = createRuntimeCheckpoint(state());
    const tampered = {
      ...checkpoint,
      state: {
        ...checkpoint.state,
        toolCallCount: checkpoint.state.toolCallCount + 1,
      },
    };

    expect(() => restoreRuntimeCheckpoint(tampered, checkpoint.runId)).toThrow(/integrity/i);
  });

  it("only allows resumable non-terminal states", () => {
    expect(checkpointCanResume(state({ status: "waiting" }))).toBe(true);
    expect(checkpointCanResume(state({ status: "paused" }))).toBe(true);
    expect(checkpointCanResume(state({ status: "completed" }))).toBe(false);
    expect(checkpointCanResume(state({ status: "failed" }))).toBe(false);
    expect(checkpointCanResume(state({ status: "cancelled" }))).toBe(false);
  });

  it("rejects unsafe or malformed recovery metadata", () => {
    expect(() => createRuntimeCheckpoint(state({ sequence: 0 }))).toThrow(/sequence/i);
    expect(() => createRuntimeCheckpoint(state({ safeCursor: "x".repeat(4_097) }))).toThrow(
      /cursor/i,
    );
  });
});
