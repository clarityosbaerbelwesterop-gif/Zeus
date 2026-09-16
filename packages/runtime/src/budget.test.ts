import { describe, expect, it } from "vitest";
import {
  EMPTY_RUNTIME_USAGE,
  RuntimeBudgetLedger,
  accumulateRuntimeUsage,
  totalRunTokens,
} from "./budget";
import { DEFAULT_RUNTIME_POLICY, RuntimeError, type RuntimePolicy } from "./index";

function policy(overrides: Partial<RuntimePolicy>): RuntimePolicy {
  return Object.freeze({ ...DEFAULT_RUNTIME_POLICY, ...overrides });
}

describe("runtime budget guardrails", () => {
  it("accumulates model usage without double-counting cached tokens", () => {
    const first = accumulateRuntimeUsage(EMPTY_RUNTIME_USAGE, {
      inputTokens: 100,
      outputTokens: 20,
      cachedTokens: 80,
      estimatedCost: 0.01,
    });
    const second = accumulateRuntimeUsage(first, {
      inputTokens: 50,
      outputTokens: 10,
      cachedTokens: 40,
      estimatedCost: 0.005,
    });

    expect(second).toEqual({
      modelCalls: 2,
      inputTokens: 150,
      outputTokens: 30,
      cachedTokens: 120,
      estimatedCost: 0.015,
    });
    expect(totalRunTokens(second)).toBe(180);
  });

  it("fails closed when token telemetry is missing under a token budget", () => {
    const ledger = new RuntimeBudgetLedger(policy({ maxRunTokens: 100 }));

    expect(() => ledger.debit({ estimatedCost: 0.001 })).toThrow(RuntimeError);
    expect(ledger.snapshot()).toEqual(EMPTY_RUNTIME_USAGE);
  });

  it("fails closed when cost telemetry is missing under a cost budget", () => {
    const ledger = new RuntimeBudgetLedger(policy({ maxEstimatedCost: 0.05 }));

    expect(() => ledger.debit({ inputTokens: 10, outputTokens: 5 })).toThrow(RuntimeError);
    expect(ledger.snapshot()).toEqual(EMPTY_RUNTIME_USAGE);
  });

  it("enforces cumulative token and estimated-cost budgets", () => {
    const ledger = new RuntimeBudgetLedger(policy({ maxRunTokens: 150, maxEstimatedCost: 0.02 }));

    ledger.debit({ inputTokens: 80, outputTokens: 20, estimatedCost: 0.01 });
    expect(() => ledger.debit({ inputTokens: 40, outputTokens: 20, estimatedCost: 0.005 })).toThrow(
      /token budget exceeded/i,
    );

    const costLedger = new RuntimeBudgetLedger(
      policy({ maxRunTokens: 1_000, maxEstimatedCost: 0.02 }),
    );
    costLedger.debit({ inputTokens: 50, outputTokens: 10, estimatedCost: 0.015 });
    expect(() =>
      costLedger.debit({ inputTokens: 10, outputTokens: 5, estimatedCost: 0.006 }),
    ).toThrow(/cost budget exceeded/i);
  });

  it("rejects malformed provider telemetry instead of allowing budget bypass", () => {
    const ledger = new RuntimeBudgetLedger(policy({ maxRunTokens: 100 }));

    expect(() => ledger.debit({ inputTokens: -1, outputTokens: 1, estimatedCost: 0 })).toThrow(
      /invalid input token/i,
    );
    expect(() =>
      accumulateRuntimeUsage(EMPTY_RUNTIME_USAGE, {
        inputTokens: 1.5,
        outputTokens: 1,
        estimatedCost: 0,
      }),
    ).toThrow(/invalid input token/i);
  });
});
