import { DEAL_STAGES } from "@zeus/workspace";
import { createDealAction, updateDealStageAction } from "@/app/app/actions";
import { crmCopy, DEAL_STAGE_COPY, formatDealValue } from "@/lib/crm-copy";
import type { WorkspacePageData } from "@/lib/product";
import { EmptyState, SectionHeader, workspaceHref } from "./workspace-ui";
import Link from "next/link";

export function PipelineView({ data, canWrite }: { data: WorkspacePageData; canWrite: boolean }) {
  const workspace = data.activeWorkspace;
  if (!workspace) return null;

  return (
    <div className="mx-auto max-w-[1400px]">
      <SectionHeader
        eyebrow={crmCopy.pipelineEyebrow}
        title={crmCopy.pipelineTitle}
        detail={crmCopy.pipelineDetail}
      />

      {canWrite ? (
        <form
          id="new-deal"
          action={createDealAction}
          className="mb-7 grid gap-2 rounded-[22px] border border-[var(--line)] bg-white/40 p-4 md:grid-cols-[1.4fr_.7fr_.9fr_auto]"
        >
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <input
            required
            name="title"
            maxLength={240}
            placeholder={crmCopy.dealTitle}
            className="rounded-xl border border-[var(--line)] bg-white/65 px-3 py-2 text-sm"
          />
          <input
            name="value"
            inputMode="decimal"
            placeholder="12.500"
            aria-label={crmCopy.dealValue}
            className="rounded-xl border border-[var(--line)] bg-white/65 px-3 py-2 text-sm"
          />
          <select
            name="ownerUserId"
            defaultValue={data.account.user.id}
            className="rounded-xl border border-[var(--line)] bg-white/65 px-3 py-2 text-sm"
            aria-label={crmCopy.dealOwner}
          >
            {data.members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.user?.name || member.user?.email || member.userId}
              </option>
            ))}
          </select>
          <button className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm text-white">
            {crmCopy.createDeal}
          </button>
        </form>
      ) : null}

      {data.deals.length ? (
        <div className="task-board pipeline-board mt-2 grid gap-3 xl:grid-cols-6">
          {DEAL_STAGES.map((stage) => {
            const columnDeals = data.deals.filter((deal) => deal.stage === stage);
            return (
              <section
                key={stage}
                className="min-w-0 rounded-2xl border border-[var(--line)] bg-white/25 p-3"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.1em]">
                    {DEAL_STAGE_COPY[stage].de}
                  </h2>
                  <span className="text-xs text-[var(--muted)]">{columnDeals.length}</span>
                </div>
                <p className="mb-3 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                  {DEAL_STAGE_COPY[stage].en}
                </p>
                <div className="space-y-2">
                  {columnDeals.map((deal) => (
                    <article
                      key={deal.id}
                      className="rounded-xl border border-[var(--line)] bg-white/65 p-3"
                    >
                      <Link
                        href={workspaceHref(workspace.id, "deal-room", { deal: deal.id })}
                        className="block"
                      >
                        <p className="text-sm font-medium leading-5">{deal.title}</p>
                        <p className="mt-2 text-xs text-[var(--muted)]">
                          {formatDealValue(deal.valueCents, deal.currency)} · {deal.ownerName}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[var(--muted)]">
                          {crmCopy.nextStep}: {deal.nextStep}
                        </p>
                      </Link>
                      {canWrite ? (
                        <form
                          action={updateDealStageAction}
                          className="mt-3 border-t border-[var(--line)] pt-3"
                        >
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <input type="hidden" name="dealId" value={deal.id} />
                          <select
                            name="stage"
                            defaultValue={deal.stage}
                            className="w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-xs"
                            aria-label={crmCopy.stage}
                          >
                            {DEAL_STAGES.map((item) => (
                              <option key={item} value={item}>
                                {DEAL_STAGE_COPY[item].de}
                              </option>
                            ))}
                          </select>
                          <button className="mt-2 text-xs font-medium underline underline-offset-4">
                            {crmCopy.save}
                          </button>
                        </form>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyState title={crmCopy.emptyPipelineTitle} detail={crmCopy.emptyPipelineDetail} />
      )}
    </div>
  );
}
