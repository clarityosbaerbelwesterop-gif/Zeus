import { setSkillLifecycleAction } from "@/app/app/actions";
import type { WorkspacePageData } from "@/lib/product";
import { SectionHeader } from "./workspace-ui";

export function SkillsView({
  data,
  canManage,
}: {
  data: WorkspacePageData;
  canManage: boolean;
}) {
  const workspace = data.activeWorkspace;
  if (!workspace) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionHeader
        eyebrow="Governed capability layer"
        title="Skills"
        detail="Review provenance, tests and security status before a reusable procedure can become trusted or enter an agent run."
      />
      {data.skills.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-white/45 p-6 text-sm text-[var(--muted)]">
          No workspace or built-in skills are registered yet. Generated skills remain disabled until
          they are tested, security-reviewed and explicitly trusted.
        </div>
      ) : (
        <div className="space-y-3">
          {data.skills.map((skill) => {
            const ready =
              skill.testStatus === "passing" && skill.securityStatus === "passed";
            return (
              <article
                key={skill.id}
                className="rounded-2xl border border-[var(--line)] bg-white/50 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{skill.name}</h2>
                      <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] capitalize text-[var(--muted)]">
                        {skill.sourceType}
                      </span>
                      <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] capitalize text-[var(--muted)]">
                        {skill.trustLevel}
                      </span>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
                      {skill.description || skill.slug}
                    </p>
                    <p className="mt-3 text-xs text-[var(--muted)]">
                      v{skill.currentVersion} · tests {skill.testStatus ?? "untested"} · security{" "}
                      {skill.securityStatus ?? "pending"} · {skill.enabled ? "enabled" : "disabled"}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap gap-2">
                      {skill.trustLevel === "candidate" || skill.trustLevel === "untrusted" ? (
                        <SkillAction
                          workspaceId={workspace.id}
                          skillId={skill.id}
                          decision="review"
                          label="Mark reviewed"
                        />
                      ) : null}
                      {skill.trustLevel === "reviewed" && ready ? (
                        <SkillAction
                          workspaceId={workspace.id}
                          skillId={skill.id}
                          decision="trust"
                          label="Trust"
                        />
                      ) : null}
                      {skill.trustLevel === "trusted" && ready && !skill.enabled ? (
                        <SkillAction
                          workspaceId={workspace.id}
                          skillId={skill.id}
                          decision="enable"
                          label="Enable"
                        />
                      ) : null}
                      {skill.enabled ? (
                        <SkillAction
                          workspaceId={workspace.id}
                          skillId={skill.id}
                          decision="disable"
                          label="Disable"
                        />
                      ) : null}
                      <SkillAction
                        workspaceId={workspace.id}
                        skillId={skill.id}
                        decision="reject"
                        label="Reject"
                      />
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SkillAction({
  workspaceId,
  skillId,
  decision,
  label,
}: {
  workspaceId: string;
  skillId: string;
  decision: "review" | "trust" | "enable" | "disable" | "reject";
  label: string;
}) {
  return (
    <form action={setSkillLifecycleAction}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="skillId" value={skillId} />
      <input type="hidden" name="decision" value={decision} />
      <button className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium">
        {label}
      </button>
    </form>
  );
}
