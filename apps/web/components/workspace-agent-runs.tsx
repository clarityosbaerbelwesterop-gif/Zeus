import { startDealAgentRunAction } from "@/app/app/actions";
import { crmCopy } from "@/lib/crm-copy";
import type { WorkspacePageData } from "@/lib/product";
import { LiveRefresh } from "./live-refresh";
import { RunPanel } from "./workspace-run-panel";
import { EmptyState, timeLabel } from "./workspace-ui";

const activeStatuses = new Set([
  "queued",
  "preparing",
  "running",
  "waiting",
  "verifying",
  "paused",
  "needs_user_input",
  "needs_authorization",
]);

export function AgentRunsPanel({
  data,
  deal,
  canWrite,
}: {
  data: WorkspacePageData;
  deal: WorkspacePageData["deals"][number];
  canWrite: boolean;
}) {
  const linkedRuns = data.runs.filter(
    (run) => deal.conversationId !== null && run.conversationId === deal.conversationId,
  );
  const latest = linkedRuns[0] ?? null;
  const live = linkedRuns.some((run) => activeStatuses.has(run.status));
  const enabledAgents = data.agents.filter((agent) => agent.enabled);

  return (
    <aside className="space-y-5">
      <LiveRefresh active={live} />
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          {crmCopy.agentRunsEyebrow}
        </p>
        <h2 className="mt-1 text-xl font-semibold">{crmCopy.agentRunsTitle}</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{crmCopy.agentRunsDetail}</p>
      </div>

      {canWrite && deal.conversationId ? (
        <form
          action={startDealAgentRunAction}
          className="rounded-[22px] border border-[var(--line)] bg-white/45 p-4"
        >
          <input type="hidden" name="workspaceId" value={deal.workspaceId} />
          <input type="hidden" name="dealId" value={deal.id} />
          <input type="hidden" name="conversationId" value={deal.conversationId} />
          <select
            name="agentCode"
            defaultValue={
              enabledAgents.find((agent) => agent.code === "sara")?.code ??
              enabledAgents[0]?.code ??
              "jorge"
            }
            className="w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm"
          >
            {enabledAgents.map((agent) => (
              <option key={agent.code} value={agent.code}>
                {agent.name}
              </option>
            ))}
          </select>
          <textarea
            required
            name="instruction"
            maxLength={8000}
            rows={3}
            placeholder={crmCopy.runInstruction}
            className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm"
          />
          <button className="mt-2 w-full rounded-xl bg-[var(--ink)] px-3 py-2 text-sm text-white">
            {crmCopy.startRun}
          </button>
        </form>
      ) : null}

      {latest ? (
        <RunPanel
          workspaceId={deal.workspaceId}
          runId={latest.id}
          {...(deal.conversationId ? { conversationId: deal.conversationId } : {})}
          dealId={deal.id}
          view="deal-room"
          title={crmCopy.latestRun}
        />
      ) : (
        <EmptyState title={crmCopy.noRuns} detail={crmCopy.agentRunsDetail} />
      )}

      <section className="rounded-[22px] border border-[var(--line)] bg-white/35 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em]">
          {crmCopy.agentRunsEyebrow}
        </h3>
        <div className="mt-3 space-y-2">
          {linkedRuns.map((run) => (
            <div
              key={run.id}
              className="rounded-xl border border-[var(--line)] bg-white/55 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{run.objective}</p>
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                  {run.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                {run.agentCode} · {run.id.slice(0, 8)} · {timeLabel(run.createdAt)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[22px] border border-[var(--line)] bg-white/35 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em]">{crmCopy.planSteps}</h3>
        <div className="mt-3 space-y-2">
          {data.planSteps.map((step) => (
            <div key={step.id} className="flex items-center gap-3 text-sm">
              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[11px]">
                {step.sequence}
              </span>
              <span className="min-w-0 flex-1 truncate">{step.title}</span>
              <span className="text-[11px] capitalize text-[var(--muted)]">
                {step.status.replaceAll("_", " ")}
                {step.assignedAgent ? ` · ${step.assignedAgent}` : ""}
              </span>
            </div>
          ))}
          {!data.planSteps.length ? (
            <p className="text-xs leading-5 text-[var(--muted)]">
              Kein aktiver Plan. Plan-Schritte bleiben die bestehende Plan-Quelle.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-[22px] border border-[var(--line)] bg-white/35 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em]">{crmCopy.teamAgents}</h3>
        <div className="mt-3 space-y-2">
          {enabledAgents.map((agent) => (
            <div key={agent.code} className="flex items-center justify-between gap-3 text-sm">
              <span>{agent.name}</span>
              <span className="text-[11px] capitalize text-[var(--muted)]">{agent.presence}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
