import type { WorkspacePageData } from "@/lib/product";
import { EmptyState, SectionHeader, timeLabel, workspaceHref } from "./workspace-ui";
import Link from "next/link";

export function WorkspaceHome({ data }: { data: WorkspacePageData }) {
  const workspace = data.activeWorkspace;
  if (!workspace) return null;
  const activeTasks = data.tasks.filter(
    (task) => !["completed", "cancelled"].includes(task.status),
  );
  const blockedTasks = data.tasks.filter((task) => task.status === "blocked");
  const activeRuns = data.runs.filter((run) =>
    ["queued", "running", "waiting"].includes(run.status),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeader
        eyebrow="Workspace home"
        title={workspace.name}
        detail={
          workspace.objective ||
          "Set a workspace objective so every teammate shares the same durable direction."
        }
      />

      <div className="workspace-summary-grid grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Team"
          value={`${data.agents.filter((agent) => agent.enabled).length} enabled`}
          detail={`${activeRuns.length} active / waiting runs`}
        />
        <SummaryCard
          label="Tasks"
          value={`${activeTasks.length} open`}
          detail={blockedTasks.length ? `${blockedTasks.length} blocked` : "Nothing blocked"}
        />
        <SummaryCard
          label="Artifacts"
          value={`${data.artifacts.length} recent`}
          detail={`${data.files.length} source files`}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_.9fr]">
        <section className="soft-panel rounded-[22px] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                Current focus
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                {workspace.currentFocus ||
                  data.activePlan?.title ||
                  "Choose the next important thing"}
              </h2>
            </div>
            <Link
              href={workspaceHref(workspace.id, "plans")}
              className="text-xs text-[var(--muted)] underline underline-offset-4"
            >
              Plans
            </Link>
          </div>
          {data.activePlan ? (
            <div className="mt-5 border-t border-[var(--line)] pt-4">
              <p className="text-sm font-medium">{data.activePlan.title}</p>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                {data.activePlan.objective}
              </p>
              <div className="mt-4 space-y-2">
                {data.planSteps.slice(0, 5).map((step) => (
                  <div key={step.id} className="flex items-center gap-3 text-sm">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[11px]">
                      {step.sequence}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{step.title}</span>
                    <span className="text-xs capitalize text-[var(--muted)]">
                      {step.status.replaceAll("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              No active plan yet. Create one when the work needs a durable execution strategy.
            </p>
          )}
        </section>

        <section className="soft-panel rounded-[22px] p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            Needs attention
          </p>
          <div className="mt-4 space-y-3">
            {blockedTasks.slice(0, 5).map((task) => (
              <div key={task.id} className="rounded-xl border border-[var(--line)] bg-white/45 p-3">
                <p className="text-sm font-medium">{task.title}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Blocked · {task.assignedAgent ?? "unassigned"}
                </p>
              </div>
            ))}
            {!blockedTasks.length ? (
              <p className="text-sm leading-6 text-[var(--muted)]">No blocked tasks right now.</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Open tasks</h2>
            <Link
              href={workspaceHref(workspace.id, "tasks")}
              className="text-xs text-[var(--muted)]"
            >
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {activeTasks.slice(0, 6).map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--line)] bg-white/35 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  <p className="mt-1 text-xs capitalize text-[var(--muted)]">
                    {task.status.replaceAll("_", " ")} · {task.assignedAgent ?? "unassigned"}
                  </p>
                </div>
                <span className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  {task.priority}
                </span>
              </div>
            ))}
            {!activeTasks.length ? (
              <EmptyState
                title="No tasks yet"
                detail="Create a task or ask Jorge to organize the work once the agent runtime is available."
              />
            ) : null}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent artifacts</h2>
            <Link
              href={workspaceHref(workspace.id, "artifacts")}
              className="text-xs text-[var(--muted)]"
            >
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {data.artifacts.slice(0, 6).map((artifact) => (
              <div
                key={artifact.id}
                className="rounded-2xl border border-[var(--line)] bg-white/35 px-4 py-3"
              >
                <p className="text-sm font-medium">{artifact.title}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {artifact.creatingAgent ?? "User"} · {artifact.kind} ·{" "}
                  {timeLabel(artifact.createdAt)}
                </p>
              </div>
            ))}
            {!data.artifacts.length ? (
              <EmptyState
                title="No artifacts yet"
                detail="Outputs created by your team will appear here with their run and task provenance."
              />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white/35 p-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{detail}</p>
    </div>
  );
}
