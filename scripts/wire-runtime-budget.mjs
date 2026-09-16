import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(text, search, replacement, label) {
  const first = text.indexOf(search);
  if (first < 0 || text.indexOf(search, first + search.length) >= 0) {
    throw new Error(`${label} anchor missing or ambiguous`);
  }
  return text.slice(0, first) + replacement + text.slice(first + search.length);
}

const enginePath = "packages/runtime/src/engine.ts";
let engine = readFileSync(enginePath, "utf8");
engine = replaceOnce(
  engine,
  'import type { AssembledContext, SafeContextTrace } from "./context";\nimport {\n',
  'import type { AssembledContext, SafeContextTrace } from "./context";\nimport {\n  assertRuntimeBudgetWithinPolicy,\n  assertRuntimeUsageTelemetry,\n  type RuntimeUsageTotals,\n} from "./budget";\nimport {\n',
  "engine budget import",
);
engine = replaceOnce(
  engine,
  '  recordUsage(run: RuntimeRun, provider: string, model: string, usage?: ModelUsage): Promise<void>;\n',
  '  recordUsage(\n    run: RuntimeRun,\n    provider: string,\n    model: string,\n    usage?: ModelUsage,\n  ): Promise<RuntimeUsageTotals>;\n',
  "runtime store usage signature",
);
engine = replaceOnce(
  engine,
  '        await dependencies.store.recordUsage(current, output.provider, output.model, output.usage);\n        await dependencies.store.updateStep(modelStep.id, "completed", {\n',
  '        assertRuntimeUsageTelemetry(output.usage, policy);\n        const usageTotals = await dependencies.store.recordUsage(\n          current,\n          output.provider,\n          output.model,\n          output.usage,\n        );\n        assertRuntimeBudgetWithinPolicy(usageTotals, policy);\n        await dependencies.store.updateStep(modelStep.id, "completed", {\n',
  "engine usage enforcement",
);
writeFileSync(enginePath, engine);

const runtimePath = "apps/web/lib/agent-runtime.ts";
let runtime = readFileSync(runtimePath, "utf8");
const methodStart = runtime.indexOf(
  "    async recordUsage(run, provider, model, usage?: ModelUsage) {",
);
const methodEnd = runtime.indexOf(
  "    async recordVerification(run, evidence: VerificationEvidence) {",
  methodStart,
);
if (methodStart < 0 || methodEnd < 0) {
  throw new Error("runtime store usage method anchors missing");
}
const replacement = [
  "    async recordUsage(run, provider, model, usage?: ModelUsage) {",
  "      return withActor(actorId, async (db) => {",
  "        await db.insert(usageRecords).values({",
  "          organizationId: run.organizationId,",
  "          workspaceId: run.workspaceId,",
  "          runId: run.id,",
  "          agentCode: run.agent,",
  "          provider: provider.slice(0, 120),",
  "          model: model.slice(0, 240),",
  "          inputTokens: usage?.inputTokens ?? null,",
  "          outputTokens: usage?.outputTokens ?? null,",
  "          cachedTokens: usage?.cachedTokens ?? null,",
  "          estimatedCost:",
  "            usage?.estimatedCost === undefined ? null : usage.estimatedCost.toFixed(8),",
  "          latencyMs: usage?.latencyMs ?? null,",
  "        });",
  "        const totals = (",
  "          await db",
  "            .select({",
  "              modelCalls: count(),",
  '              inputTokens: sql<string>`coalesce(sum(${usageRecords.inputTokens}), 0)::text`,',
  '              outputTokens: sql<string>`coalesce(sum(${usageRecords.outputTokens}), 0)::text`,',
  '              cachedTokens: sql<string>`coalesce(sum(${usageRecords.cachedTokens}), 0)::text`,',
  '              estimatedCost: sql<string>`coalesce(sum(${usageRecords.estimatedCost}), 0)::text`,',
  "            })",
  "            .from(usageRecords)",
  "            .where(eq(usageRecords.runId, run.id))",
  "            .limit(1)",
  "        )[0];",
  "        return {",
  "          modelCalls: Number(totals?.modelCalls ?? 0),",
  "          inputTokens: Number(totals?.inputTokens ?? 0),",
  "          outputTokens: Number(totals?.outputTokens ?? 0),",
  "          cachedTokens: Number(totals?.cachedTokens ?? 0),",
  "          estimatedCost: Number(totals?.estimatedCost ?? 0),",
  "        };",
  "      });",
  "    },",
  "",
].join("\n");
runtime = runtime.slice(0, methodStart) + replacement + runtime.slice(methodEnd);
writeFileSync(runtimePath, runtime);
