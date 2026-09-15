from pathlib import Path

p = Path("apps/web/lib/agent-runtime.ts")
s = p.read_text()
anchor = 'import { createOpenRouterProviderFromEnv } from "@zeus/runtime/openrouter";'
if "registerKaiCodingTools" not in s:
    s = s.replace(anchor, anchor + '\nimport { registerKaiCodingTools } from "./kai-coding-tools";', 1)
old = "  return registry;\n}\n\nasync function contextForRun"
if old in s:
    s = s.replace(old, "  registerKaiCodingTools(registry);\n  return registry;\n}\n\nasync function contextForRun", 1)
old = "    const calls = await db\n      .select({ status: toolCalls.status })"
if old in s:
    s = s.replace(old, "    const calls = await db\n      .select({ status: toolCalls.status, toolId: toolCalls.toolId })", 1)
marker = '    const incomplete = calls.filter((call) => call.status !== "completed");\n    return ['
if marker in s:
    s = s.replace(marker, '''    const incomplete = calls.filter((call) => call.status !== "completed");
    const completionRequirement = agentRuntimePolicy(run.agent).completionRequirement;
    const completionSatisfied =
      !completionRequirement ||
      calls.some((call) => call.status === "completed" && call.toolId === completionRequirement.toolId);
    return [''', 1)
marker = '''      {
        status: incomplete.length === 0 ? "passed" : "failed",
        checkName: "tool_calls_terminal",'''
if marker in s and 'checkName: "completion_requirement"' not in s:
    s = s.replace(marker, '''      {
        status: completionSatisfied ? "passed" : "failed",
        checkName: "completion_requirement",
        safeDetail: completionSatisfied
          ? "The agent completion contract is satisfied by durable tool evidence."
          : completionRequirement?.recoveryInstructions ?? "Required completion evidence is missing.",
      },
''' + marker, 1)
marker = '''      if (!policy.allowedTools.includes(tool.id)) {
        throw new RuntimeError('''
if marker in s:
    s = s.replace(marker, '''      if (policy.deniedTools.includes(tool.id) || !policy.allowedTools.includes(tool.id)) {
        throw new RuntimeError(''', 1)
p.write_text(s)

p = Path("apps/web/app/app/actions.ts")
s = p.read_text()
if 'import { requireSession } from "@zeus/auth/server";' not in s:
    s = s.replace('import type { AgentCode } from "@zeus/agents";', 'import type { AgentCode } from "@zeus/agents";\nimport { requireSession } from "@zeus/auth/server";', 1)
if "approveAndExecuteRepositoryChangeRequest" not in s:
    marker = "import {\n  retryAgentRun,"
    s = s.replace(marker, 'import { approveAndExecuteRepositoryChangeRequest } from "@/lib/kai-coding-tools";\n' + marker, 1)
    s += '''

export async function approveRepositoryChangeAction(formData: FormData) {
  const workspaceId = field(formData, "workspaceId");
  const requestId = field(formData, "requestId");
  const session = await requireSession();
  await approveAndExecuteRepositoryChangeRequest(String(session.user.id), requestId);
  revalidatePath("/app");
  redirect(workspaceLocation(workspaceId, field(formData, "view") || "chat"));
}
'''
p.write_text(s)

p = Path("apps/web/components/workspace-run-panel.tsx")
s = p.read_text()
if "approveRepositoryChangeAction" not in s:
    s = s.replace('import { retryRunAction, stopRunAction } from "@/app/app/actions";', 'import { approveRepositoryChangeAction, retryRunAction, stopRunAction } from "@/app/app/actions";\nimport { requireSession } from "@zeus/auth/server";\nimport { listRunRepositoryChangeRequests } from "@/lib/kai-coding-tools";', 1)
    marker = '  const retryable = run.status === "failed" || run.status === "cancelled";'
    s = s.replace(marker, marker + '\n  const session = await requireSession();\n  const changeRequests = run.agent === "kai" ? await listRunRepositoryChangeRequests(String(session.user.id), run.id) : [];', 1)
    marker = '          {evidence.events.length ? ('
    block = '''          {changeRequests.filter((request) => request.status === "pending").map((request) => (
            <form key={request.id} action={approveRepositoryChangeAction} className="mt-3 rounded-xl border border-[var(--line)] bg-white/60 p-3">
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="requestId" value={request.id} />
              {view ? <input type="hidden" name="view" value={view} /> : null}
              <p className="font-medium">Approval required: {request.operation.replaceAll("_", " ")}</p>
              <p className="mt-1 text-[11px] text-[var(--muted)]">{request.headBranch} · {request.expectedHeadSha.slice(0, 8)}</p>
              <button className="mt-2 rounded-full bg-[var(--ink)] px-3 py-1 text-[11px] font-medium text-white">Approve & execute</button>
            </form>
          ))}
'''
    s = s.replace(marker, block + marker, 1)
p.write_text(s)
