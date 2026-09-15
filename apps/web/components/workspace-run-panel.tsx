import { approveRepositoryChangeAction, retryRunAction, stopRunAction } from "@/app/app/actions";
import { requireSession } from "@zeus/auth/server";
import { listRunRepositoryChangeRequests } from "@/lib/kai-coding-tools";
import { getRunEvidence } from "@/lib/agent-runtime";
import { latestRuntimeRunId } from "@/lib/run-queries";
import { timeLabel } from "./workspace-ui";

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

export async function RunPanel({
  workspaceId,
  runId,
  taskId,
  conversationId,
  view,
  title = "Run",
}: {
  workspaceId: string;
  runId?: string | null;
  taskId?: string;
  conversationId?: string;
  view?: string;
  title?: string;
}) {
  const resolvedRunId =
    runId ??
    (await latestRuntimeRunId({
      workspaceId,
      ...(taskId ? { taskId } : {}),
      ...(conversationId ? { conversationId } : {}),
    }));
  if (!resolvedRunId) return null;

  const evidence = await getRunEvidence(resolvedRunId);
  const { run, steps, tools, verification } = evidence;
  const active = activeStatuses.has(run.status);
  const retryable = run.status === "failed" || run.status === "cancelled";
  const session = await requireSession();
  const changeRequests =
    run.agent === "kai"
      ? await listRunRepositoryChangeRequests(String(session.user.id), run.id)
      : [];

  return (
    <section className="mt-6 overflow-hidden rounded-[22px] border border-[var(--line)] bg-white/45">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
            {title}
          </p>
          <h2 className="mt-1 text-base font-semibold">{run.objective}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {run.agent} · {run.type.replaceAll("_", " ")} · {run.id.slice(0, 8)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[var(--line)] bg-white/60 px-2.5 py-1 text-[11px] font-medium capitalize">
            {run.status.replaceAll("_", " ")}
          </span>
          {active ? (
            <form action={stopRunAction}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="runId" value={run.id} />
              {conversationId ? (
                <input type="hidden" name="conversationId" value={conversationId} />
              ) : null}
              {view ? <input type="hidden" name="view" value={view} /> : null}
              <button className="rounded-full border border-[var(--line)] px-3 py-1 text-[11px] font-medium">
                Stop
              </button>
            </form>
          ) : null}
          {retryable ? (
            <form action={retryRunAction}>
              <input type="hidden" name="workspaceId" value={workspaceId} />
              <input type="hidden" name="runId" value={run.id} />
              {conversationId ? (
                <input type="hidden" name="conversationId" value={conversationId} />
              ) : null}
              {view ? <input type="hidden" name="view" value={view} /> : null}
              <button className="rounded-full bg-[var(--ink)] px-3 py-1 text-[11px] font-medium text-white">
                Retry
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-[1.25fr_.75fr]">
        <div className="border-b border-[var(--line)] p-4 md:border-b-0 md:border-r sm:p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em]">Execution</h3>
          <div className="space-y-3">
            {steps.map((step) => (
              <div key={step.id} className="grid grid-cols-[18px_1fr_auto] gap-2 text-sm">
                <span className="pt-0.5 text-[var(--muted)]">
                  {step.status === "completed"
                    ? "✓"
                    : step.status === "failed"
                      ? "!"
                      : step.status === "cancelled"
                        ? "×"
                        : "·"}
                </span>
                <div className="min-w-0">
                  <p className="font-medium">{step.title}</p>
                  {step.safeDetail ? (
                    <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">
                      {step.safeDetail}
                    </p>
                  ) : null}
                </div>
                <span className="text-[11px] capitalize text-[var(--muted)]">
                  {step.status.replaceAll("_", " ")}
                </span>
              </div>
            ))}
            {!steps.length ? (
              <p className="text-sm text-[var(--muted)]">
                No execution steps have been recorded yet.
              </p>
            ) : null}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em]">Evidence</h3>
          <dl className="space-y-3 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">Tool calls</dt>
              <dd className="font-medium">{tools.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">Verification</dt>
              <dd className="font-medium">
                {verification.length
                  ? verification.every((check) => check.status === "passed")
                    ? "Passed"
                    : "Needs attention"
                  : "Not run"}
              </dd>
            </div>
            {verification.map((check) => (
              <div
                key={check.id}
                className="rounded-xl border border-[var(--line)] bg-white/50 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-medium">{check.checkName.replaceAll("_", " ")}</dt>
                  <dd className="uppercase tracking-wider text-[10px] text-[var(--muted)]">
                    {check.status}
                  </dd>
                </div>
                <p className="mt-1.5 leading-5 text-[var(--muted)]">{check.safeDetail}</p>
              </div>
            ))}
          </dl>
          {changeRequests
            .filter((request) => request.status === "pending")
            .map((request) => (
              <form
                key={request.id}
                action={approveRepositoryChangeAction}
                className="mt-3 rounded-xl border border-[var(--line)] bg-white/60 p-3"
              >
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <input type="hidden" name="requestId" value={request.id} />
                {view ? <input type="hidden" name="view" value={view} /> : null}
                <p className="font-medium">
                  Approval required: {request.operation.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  {request.headBranch} · {request.expectedHeadSha.slice(0, 8)}
                </p>
                <button className="mt-2 rounded-full bg-[var(--ink)] px-3 py-1 text-[11px] font-medium text-white">
                  Approve & execute
                </button>
              </form>
            ))}
          {evidence.events.length ? (
            <p className="mt-4 text-[11px] text-[var(--muted)]">
              Last evidence: {timeLabel(evidence.events.at(-1)?.createdAt ?? new Date())}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
