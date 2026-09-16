import { AGENT_TEMPLATES, type AgentCode } from "@zeus/agents";
import {
  approveBusinessAutopilotAction,
  draftBusinessAutopilotAction,
} from "@/app/app/autopilot-actions";
import { businessAutopilotState } from "@/lib/business-autopilot";
import { AgentMark } from "./agent-mark";

const statusCopy: Record<string, string> = {
  planning: "Waiting for one plan approval",
  ready: "Approved and ready",
  running: "The five-agent team is executing",
  waiting: "Waiting on a dependency",
  blocked: "A verified blocker needs attention",
  integrating: "Integrating agent work",
  verifying: "Simon is verifying the result",
  completed: "Initial autonomous build completed",
  failed: "Execution failed",
  cancelled: "Execution cancelled",
};

export async function AutopilotView({
  workspaceId,
  workspaceName,
  workspaceObjective,
  canManage,
}: {
  workspaceId: string;
  workspaceName: string;
  workspaceObjective: string;
  canManage: boolean;
}) {
  if (!canManage) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-[var(--line)] bg-white/45 p-6">
        <h1 className="text-xl font-semibold">Business Autopilot</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          Workspace management access is required to approve autonomous team execution.
        </p>
      </div>
    );
  }

  const state = await businessAutopilotState(workspaceId);
  const run = state.latestRun;
  const plan = state.plan;
  const canDraft = !run || ["completed", "failed", "cancelled"].includes(run.status);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          ZEUS Business Autopilot
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
          One plan approval. Five agents execute the business.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Jorge coordinates. Kai builds. Lora designs. Sara prepares commercial and support operations.
          Simon verifies quality and security. Actions remain bounded by the workspace permissions and
          connected apps you have authorized.
        </p>
      </header>

      {canDraft ? (
        <section className="rounded-[24px] border border-[var(--line)] bg-white/55 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Start an autonomous business build</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Zeus drafts a durable five-agent execution graph first. Nothing starts until you approve
            that plan once.
          </p>
          <form action={draftBusinessAutopilotAction} className="mt-5 space-y-4">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Business name</span>
              <input
                required
                maxLength={200}
                name="businessName"
                defaultValue={workspaceName}
                className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2.5 text-sm outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">What should the business achieve?</span>
              <textarea
                required
                maxLength={12000}
                rows={5}
                name="objective"
                defaultValue={workspaceObjective}
                placeholder="Describe the product, customer, outcome and constraints."
                className="w-full resize-y rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2.5 text-sm leading-6 outline-none"
              />
            </label>
            <button className="rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white">
              Draft execution plan
            </button>
          </form>
        </section>
      ) : null}

      {run && plan ? (
        <section className="rounded-[24px] border border-[var(--line)] bg-white/55 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">Current run</p>
              <h2 className="mt-1 text-xl font-semibold">{plan.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{plan.objective}</p>
            </div>
            <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium">
              {statusCopy[run.status] ?? run.status}
            </span>
          </div>

          <div className="mt-6 space-y-2">
            {state.steps.map((step) => {
              const agent = AGENT_TEMPLATES.find((item) => item.code === step.assignedAgent);
              return (
                <div
                  key={step.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-white/50 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {agent ? (
                      <AgentMark
                        agent={{
                          code: agent.code as AgentCode,
                          name: agent.name,
                          accent: agent.accent,
                        }}
                        size={30}
                      />
                    ) : null}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{step.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {agent?.name ?? step.assignedAgent ?? "Unassigned"}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs capitalize text-[var(--muted)]">
                    {step.status.replaceAll("_", " ")}
                  </span>
                </div>
              );
            })}
          </div>

          {run.status === "planning" && plan.status === "draft" ? (
            <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[#f2eee5] p-4">
              <p className="text-sm font-semibold">One approval required</p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Approving starts the dependency-aware agent run. Routine work can continue within the
                granted tool permissions; higher-risk external actions still use Zeus approval boundaries.
              </p>
              <form action={approveBusinessAutopilotAction} className="mt-4">
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <input type="hidden" name="planId" value={plan.id} />
                <input type="hidden" name="teamRunId" value={run.id} />
                <button className="rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white">
                  Approve plan and let the team execute
                </button>
              </form>
            </div>
          ) : null}

          {run.status === "blocked" ? (
            <p className="mt-5 rounded-xl border border-[var(--line)] bg-white/65 p-3 text-sm text-[var(--muted)]">
              Zeus stopped because one or more agent runs did not reach verified completion. The existing
              run evidence remains available in the workspace instead of silently claiming success.
            </p>
          ) : null}

          {state.members.length ? (
            <p className="mt-5 text-xs text-[var(--muted)]">
              {state.members.length} durable agent run{state.members.length === 1 ? "" : "s"} linked to this TeamRun.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
