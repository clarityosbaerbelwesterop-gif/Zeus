import { addPlanStepAction, createPlanAction } from "@/app/app/actions";
import type { WorkspacePageData } from "@/lib/product";
import { EmptyState, SectionHeader } from "./workspace-ui";

export function PlansView({ data, canWrite }: { data: WorkspacePageData; canWrite: boolean }) {
  const workspace = data.activeWorkspace;
  if (!workspace) return null;

  return (
    <div className="mx-auto max-w-5xl">
      <SectionHeader
        eyebrow="Plans"
        title="Execution strategies"
        detail="Plans define durable sequencing. Tasks remain the individual units of work."
      />
      <div className="grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
        <section>
          <h2 className="mb-3 text-sm font-semibold">Workspace plans</h2>
          <div className="space-y-2">
            {data.plans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-2xl border border-[var(--line)] p-4 ${
                  plan.id === data.activePlan?.id ? "bg-white/65" : "bg-white/25"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{plan.title}</p>
                  <span className="text-xs capitalize text-[var(--muted)]">{plan.status}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{plan.objective}</p>
              </div>
            ))}
            {!data.plans.length ? (
              <EmptyState
                title="No plans yet"
                detail="Create a plan when the work benefits from a durable sequence."
              />
            ) : null}
          </div>

          {canWrite ? (
            <form
              action={createPlanAction}
              className="mt-5 space-y-2 rounded-2xl border border-[var(--line)] bg-white/30 p-4"
            >
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <input
                required
                name="title"
                maxLength={240}
                placeholder="Plan title"
                className="w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
              />
              <textarea
                name="objective"
                maxLength={12000}
                placeholder="What will this plan accomplish?"
                className="w-full rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
              />
              <button className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm text-white">
                Create plan
              </button>
            </form>
          ) : null}
        </section>

        <section className="soft-panel rounded-[22px] p-5">
          {data.activePlan ? (
            <>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                Current plan
              </p>
              <h2 className="mt-1 text-2xl font-semibold">{data.activePlan.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {data.activePlan.objective}
              </p>
              <div className="mt-6 space-y-3">
                {data.planSteps.map((step) => (
                  <div
                    key={step.id}
                    className="flex gap-3 rounded-xl border border-[var(--line)] bg-white/35 p-3"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[var(--line)] text-xs">
                      {step.sequence}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{step.title}</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {step.assignedAgent ?? "Unassigned"} · {step.status.replaceAll("_", " ")}
                      </p>
                    </div>
                  </div>
                ))}
                {!data.planSteps.length ? (
                  <p className="text-sm text-[var(--muted)]">No steps have been added yet.</p>
                ) : null}
              </div>

              {canWrite ? (
                <form
                  action={addPlanStepAction}
                  className="mt-5 grid gap-2 sm:grid-cols-[1fr_.7fr_auto]"
                >
                  <input type="hidden" name="workspaceId" value={workspace.id} />
                  <input type="hidden" name="planId" value={data.activePlan.id} />
                  <input
                    required
                    name="title"
                    maxLength={240}
                    placeholder="Next plan step"
                    className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
                  />
                  <select
                    name="assignedAgent"
                    defaultValue=""
                    className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
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
                    Add
                  </button>
                </form>
              ) : null}
            </>
          ) : (
            <EmptyState
              title="No current plan"
              detail="Jorge will eventually coordinate plans automatically. M2 gives that future runtime durable state to work with."
            />
          )}
        </section>
      </div>
    </div>
  );
}
