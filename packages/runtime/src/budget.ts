import {
  RuntimeError,
  type ModelUsage,
  type RuntimePolicy,
} from "./index";

export interface RuntimeUsageTotals {
  readonly modelCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  readonly estimatedCost: number;
}

export const EMPTY_RUNTIME_USAGE: RuntimeUsageTotals = Object.freeze({
  modelCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  estimatedCost: 0,
});

function finiteNonNegative(
  value: number | undefined,
  label: string,
  integer: boolean,
): number {
  if (value === undefined) return 0;
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw new RuntimeError("MODEL_ERROR", `Provider returned invalid ${label} usage telemetry.`);
  }
  return value;
}

function assertTelemetryAvailable(usage: ModelUsage | undefined, policy: RuntimePolicy): void {
  if (policy.maxRunTokens !== undefined) {
    if (usage?.inputTokens === undefined || usage.outputTokens === undefined) {
      throw new RuntimeError(
        "MODEL_ERROR",
        "Provider token usage telemetry is required while a run token budget is enabled.",
      );
    }
  }
  if (policy.maxEstimatedCost !== undefined && usage?.estimatedCost === undefined) {
    throw new RuntimeError(
      "MODEL_ERROR",
      "Provider cost telemetry is required while a run cost budget is enabled.",
    );
  }
}

export function accumulateRuntimeUsage(
  current: RuntimeUsageTotals,
  usage: ModelUsage | undefined,
): RuntimeUsageTotals {
  const inputTokens = finiteNonNegative(usage?.inputTokens, "input token", true);
  const outputTokens = finiteNonNegative(usage?.outputTokens, "output token", true);
  const cachedTokens = finiteNonNegative(usage?.cachedTokens, "cached token", true);
  const estimatedCost = finiteNonNegative(usage?.estimatedCost, "estimated cost", false);

  const next: RuntimeUsageTotals = {
    modelCalls: current.modelCalls + 1,
    inputTokens: current.inputTokens + inputTokens,
    outputTokens: current.outputTokens + outputTokens,
    cachedTokens: current.cachedTokens + cachedTokens,
    estimatedCost: current.estimatedCost + estimatedCost,
  };

  if (
    !Number.isSafeInteger(next.modelCalls) ||
    !Number.isSafeInteger(next.inputTokens) ||
    !Number.isSafeInteger(next.outputTokens) ||
    !Number.isSafeInteger(next.cachedTokens) ||
    !Number.isFinite(next.estimatedCost)
  ) {
    throw new RuntimeError("RUN_LIMIT_EXCEEDED", "Run usage counters exceeded safe numeric bounds.");
  }

  return Object.freeze(next);
}

export function totalRunTokens(usage: RuntimeUsageTotals): number {
  const total = usage.inputTokens + usage.outputTokens;
  if (!Number.isSafeInteger(total)) {
    throw new RuntimeError("RUN_LIMIT_EXCEEDED", "Run token counter exceeded safe numeric bounds.");
  }
  return total;
}

export function assertRuntimeBudgetWithinPolicy(
  usage: RuntimeUsageTotals,
  policy: RuntimePolicy,
): void {
  if (policy.maxRunTokens !== undefined) {
    if (!Number.isSafeInteger(policy.maxRunTokens) || policy.maxRunTokens < 0) {
      throw new RuntimeError("INTERNAL_RUNTIME_ERROR", "Invalid runtime token budget configuration.");
    }
    if (totalRunTokens(usage) > policy.maxRunTokens) {
      throw new RuntimeError("RUN_LIMIT_EXCEEDED", "Run token budget exceeded.");
    }
  }

  if (policy.maxEstimatedCost !== undefined) {
    if (!Number.isFinite(policy.maxEstimatedCost) || policy.maxEstimatedCost < 0) {
      throw new RuntimeError("INTERNAL_RUNTIME_ERROR", "Invalid runtime cost budget configuration.");
    }
    if (usage.estimatedCost > policy.maxEstimatedCost) {
      throw new RuntimeError("RUN_LIMIT_EXCEEDED", "Run estimated-cost budget exceeded.");
    }
  }
}

/**
 * Per-run fail-closed usage ledger. Instantiate one ledger for one runtime run.
 * Cached tokens are tracked for evidence but are not added a second time to the
 * token budget because provider input-token totals already represent the request.
 */
export class RuntimeBudgetLedger {
  #totals: RuntimeUsageTotals = EMPTY_RUNTIME_USAGE;

  constructor(private readonly policy: RuntimePolicy) {}

  debit(usage: ModelUsage | undefined): RuntimeUsageTotals {
    assertTelemetryAvailable(usage, this.policy);
    const next = accumulateRuntimeUsage(this.#totals, usage);
    assertRuntimeBudgetWithinPolicy(next, this.policy);
    this.#totals = next;
    return this.snapshot();
  }

  snapshot(): RuntimeUsageTotals {
    return Object.freeze({ ...this.#totals });
  }
}
