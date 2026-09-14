import { TASK_PRIORITIES } from "@zeus/workspace";
import {
  archiveWorkspaceAction,
  updateWorkspaceAction,
  updateWorkspaceMemberAction,
} from "@/app/app/actions";
import type { WorkspacePageData } from "@/lib/product";
import { SectionHeader } from "./workspace-ui";

export function SettingsView({ data, canManage }: { data: WorkspacePageData; canManage: boolean }) {
  const workspace = data.activeWorkspace;
  if (!workspace) return null;

  return (
    <div className="mx-auto max-w-4xl">
      <SectionHeader
        eyebrow="Workspace settings"
        title="Shared project state"
        detail="Workspace configuration is durable project state, not a prompt hidden in the interface."
      />
      <form
        action={updateWorkspaceAction}
        className="grid gap-4 rounded-[22px] border border-[var(--line)] bg-white/35 p-5 sm:grid-cols-2"
      >
        <input type="hidden" name="workspaceId" value={workspace.id} />
        <label className="text-xs text-[var(--muted)]">
          Name
          <input
            disabled={!canManage}
            required
            name="name"
            defaultValue={workspace.name}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Priority
          <select
            disabled={!canManage}
            name="priority"
            defaultValue={workspace.priority}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
          >
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[var(--muted)] sm:col-span-2">
          Description
          <textarea
            disabled={!canManage}
            name="description"
            defaultValue={workspace.description}
            maxLength={2000}
            rows={2}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
          />
        </label>
        <label className="text-xs text-[var(--muted)] sm:col-span-2">
          Objective
          <textarea
            disabled={!canManage}
            name="objective"
            defaultValue={workspace.objective}
            maxLength={12000}
            rows={3}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
          />
        </label>
        <label className="text-xs text-[var(--muted)] sm:col-span-2">
          Success criteria
          <textarea
            disabled={!canManage}
            name="successCriteria"
            defaultValue={workspace.successCriteria}
            maxLength={12000}
            rows={3}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
          />
        </label>
        <label className="text-xs text-[var(--muted)] sm:col-span-2">
          Current focus
          <textarea
            disabled={!canManage}
            name="currentFocus"
            defaultValue={workspace.currentFocus}
            maxLength={4000}
            rows={2}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Status
          <select
            disabled={!canManage}
            name="status"
            defaultValue={workspace.status}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm text-[var(--ink)] disabled:opacity-60"
          >
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="completed">completed</option>
          </select>
        </label>
        {canManage ? (
          <div className="flex items-end">
            <button className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm text-white">
              Save workspace
            </button>
          </div>
        ) : null}
      </form>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Members</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Roles are enforced by centralized application permissions and PostgreSQL RLS.
        </p>
        <div className="mt-4 space-y-2">
          {data.members.map((member) => (
            <div
              key={member.userId}
              className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-white/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium">{member.user?.name ?? member.userId}</p>
                <p className="text-xs text-[var(--muted)]">{member.user?.email ?? member.userId}</p>
              </div>
              {canManage ? (
                <form action={updateWorkspaceMemberAction} className="flex gap-2">
                  <input type="hidden" name="workspaceId" value={workspace.id} />
                  <input type="hidden" name="userId" value={member.userId} />
                  <select
                    name="role"
                    defaultValue={member.role}
                    className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-xs"
                  >
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                    <option value="viewer">viewer</option>
                  </select>
                  <button className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs">
                    Update
                  </button>
                </form>
              ) : (
                <span className="text-xs uppercase text-[var(--muted)]">{member.role}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-[22px] border border-[#d7c1bb] bg-[#fff8f5] p-5">
        <h2 className="text-lg font-semibold">Danger zone</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Archiving hides the workspace without deleting its history.
        </p>
        {canManage ? (
          <form action={archiveWorkspaceAction} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <input
              required
              name="confirmation"
              placeholder={`Type ${workspace.name}`}
              className="min-w-0 flex-1 rounded-xl border border-[#d7c1bb] bg-white px-3 py-2 text-sm"
            />
            <button className="rounded-xl border border-[#b98e82] px-4 py-2 text-sm">
              Archive workspace
            </button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
