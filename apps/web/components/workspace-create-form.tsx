import { AGENT_TEMPLATES } from "@zeus/agents";
import { createWorkspaceAction } from "@/app/app/actions";
import { AgentMark } from "./agent-mark";

export function WorkspaceCreateForm() {
  return (
    <form action={createWorkspaceAction} className="space-y-4">
      <input
        name="name"
        required
        maxLength={120}
        placeholder="Launch Zeus"
        className="w-full rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3"
      />
      <textarea
        name="description"
        maxLength={2000}
        rows={2}
        placeholder="What is this workspace responsible for?"
        className="w-full rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3"
      />
      <textarea
        name="objective"
        maxLength={12000}
        rows={3}
        placeholder="Objective: Ship Zeus as a production-ready AI work environment."
        className="w-full rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3"
      />
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-[var(--muted)]">Choose your team</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {AGENT_TEMPLATES.map((agent) => (
            <label
              key={agent.code}
              className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/40 p-3"
            >
              <input
                type="checkbox"
                name="agents"
                value={agent.code}
                defaultChecked={agent.code !== "sara"}
              />
              <AgentMark agent={agent} size={34} />
              <span>
                <span className="block text-sm font-medium">{agent.name}</span>
                <span className="text-xs text-[var(--muted)]">{agent.role}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <button className="min-h-11 rounded-full bg-[var(--ink)] px-6 py-3 text-sm font-semibold text-white">
        Create workspace
      </button>
    </form>
  );
}
