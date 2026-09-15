import { TASK_PRIORITIES, TASK_STATUSES } from "@zeus/workspace";
import { createTaskAction, updateTaskAction } from "@/app/app/actions";
import type { WorkspacePageData } from "@/lib/product";
import { EmptyState, SectionHeader } from "./workspace-ui";

export function TasksView({ data, canWrite }: { data: WorkspacePageData; canWrite: boolean }) {
  const workspace = data.activeWorkspace;
  if (!workspace) return null;
  const columns: readonly { status: string; label: string }[] = [
    { status: "backlog", label: "Backlog" },
    { status: "ready", label: "Ready" },
    { status: "in_progress", label: "In progress" },
    { status: "blocked", label: "Blocked" },
    { status: "review", label: "Review" },
    { status: "completed", label: "Done" },
  ];

  return (
    <div className="mx-auto max-w-[1300px]">
      <SectionHeader
        eyebrow="Tasks"
        title="Work, without the Jira feeling"
        detail="Tasks coordinate humans and agents. Every status and assignment is persisted in this workspace."
      />
      {canWrite ? (
        <form
          id="new-task"
          action={createTaskAction}
          className="mb-7 grid gap-2 rounded-[22px] border border-[var(--line)] bg-white/40 p-4 md:grid-cols-[1.2fr_1.4fr_.6fr_.7fr_auto]"
        >
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <input
            required
            name="title"
            maxLength={240}
            placeholder="New task"
            className="rounded-xl border border-[var(--line)] bg-white/65 px-3 py-2 text-sm"
          />
          <input
            name="description"
            maxLength={12000}
            placeholder="What needs to be done?"
            className="rounded-xl border border-[var(--line)] bg-white/65 px-3 py-2 text-sm"
          />
          <select
            name="priority"
            defaultValue="medium"
            className="rounded-xl border border-[var(--line)] bg-white/65 px-3 py-2 text-sm"
          >
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
          <select
            name="assignedAgent"
            defaultValue=""
            className="rounded-xl border border-[var(--line)] bg-white/65 px-3 py-2 text-sm"
          >
            <option value="">Unassigned</option>
            {data.agents
              .filter((agent) => agent.enabled)
              .map((agent) => (
                <option key={agent.code} value={agent.code}>
                  {agent.name}
                </option>
              ))}
          </select>
          <button className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm text-white">
            Create
          </button>
        </form>
      ) : null}

      {data.tasks.length ? (
        <>
          <div className="task-board grid gap-3 xl:grid-cols-6">
            {columns.map((column) => (
              <section
                key={column.status}
                className="min-w-0 rounded-2xl border border-[var(--line)] bg-white/25 p-3"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.1em]">
                    {column.label}
                  </h2>
                  <span className="text-xs text-[var(--muted)]">
                    {data.tasks.filter((task) => task.status === column.status).length}
                  </span>
                </div>
                <div className="space-y-2">
                  {data.tasks
                    .filter((task) => task.status === column.status)
                    .map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        workspaceId={workspace.id}
                        agents={data.agents}
                        canWrite={canWrite}
                      />
                    ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">List view</h2>
            <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
              {data.tasks.map((task) => (
                <div
                  key={task.id}
                  className="grid gap-2 border-b border-[var(--line)] bg-white/30 px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                >
                  <div>
                    <p className="text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {task.assignedAgent ?? "Unassigned"}
                    </p>
                  </div>
                  <span className="text-xs capitalize text-[var(--muted)]">
                    {task.status.replaceAll("_", " ")}
                  </span>
                  <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          title="No tasks yet"
          detail="Create a task or ask Jorge to organize the work."
        />
      )}
    </div>
  );
}

function TaskCard({
  task,
  workspaceId,
  agents,
  canWrite,
}: {
  task: WorkspacePageData["tasks"][number];
  workspaceId: string;
  agents: WorkspacePageData["agents"];
  canWrite: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white/65 p-3">
      <p className="text-sm font-medium leading-5">{task.title}</p>
      {task.description ? (
        <p className="mt-1 line-clamp-3 text-xs leading-5 text-[var(--muted)]">
          {task.description}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] uppercase tracking-wider text-[var(--muted)]">
        {task.assignedAgent ?? "unassigned"} · {task.priority}
      </p>
      {canWrite ? (
        <form
          action={updateTaskAction}
          className="mt-3 space-y-2 border-t border-[var(--line)] pt-3"
        >
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="title" value={task.title} />
          <input type="hidden" name="description" value={task.description} />
          <input type="hidden" name="priority" value={task.priority} />
          <select
            name="status"
            defaultValue={task.status}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-xs"
          >
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <select
            name="assignedAgent"
            defaultValue={task.assignedAgent ?? ""}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-xs"
          >
            <option value="">Unassigned</option>
            {agents
              .filter((agent) => agent.enabled)
              .map((agent) => (
                <option key={agent.code} value={agent.code}>
                  {agent.name}
                </option>
              ))}
          </select>
          <button className="text-xs font-medium underline underline-offset-4">Save</button>
        </form>
      ) : null}
    </div>
  );
}
