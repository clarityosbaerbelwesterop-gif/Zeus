import { AGENT_TEMPLATES } from "@zeus/agents";
import { can, DEAL_STAGES } from "@zeus/workspace";
import { sendDealMessageAction, updateDealStageAction } from "@/app/app/actions";
import { crmCopy, DEAL_STAGE_COPY, formatDealValue } from "@/lib/crm-copy";
import type { WorkspacePageData } from "@/lib/product";
import { AgentRunsPanel } from "./workspace-agent-runs";
import { EmptyState, SectionHeader, timeLabel, workspaceHref } from "./workspace-ui";
import Link from "next/link";

export function DealRoomView({ data }: { data: WorkspacePageData }) {
  const workspace = data.activeWorkspace;
  const deal = data.activeDeal;
  if (!workspace) return null;
  if (!deal) {
    return (
      <div className="mx-auto max-w-3xl">
        <SectionHeader
          eyebrow={crmCopy.dealRoomEyebrow}
          title={crmCopy.dealRoomTitle}
          detail={crmCopy.dealRoomDetail}
        />
        <EmptyState title={crmCopy.emptyPipelineTitle} detail={crmCopy.emptyPipelineDetail} />
        <Link
          href={workspaceHref(workspace.id, "pipeline")}
          className="mt-4 inline-block text-sm text-[var(--muted)] underline underline-offset-4"
        >
          {crmCopy.backToPipeline}
        </Link>
      </div>
    );
  }

  const writable = Boolean(data.membershipRole && can(data.membershipRole, "deal.write"));
  const conversationWritable = Boolean(
    data.membershipRole && can(data.membershipRole, "conversation.write"),
  );
  const participants = data.participants
    .filter((item) => item.conversationId === deal.conversationId)
    .map(
      (item) =>
        AGENT_TEMPLATES.find((agent) => agent.code === item.agentCode)?.name ?? item.agentCode,
    );

  return (
    <div className="mx-auto max-w-[1280px]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          eyebrow={crmCopy.dealRoomEyebrow}
          title={deal.title}
          detail={`${formatDealValue(deal.valueCents, deal.currency)} · ${deal.ownerName} · ${DEAL_STAGE_COPY[deal.stage].de}`}
        />
        <Link
          href={workspaceHref(workspace.id, "pipeline")}
          className="text-xs text-[var(--muted)] underline underline-offset-4"
        >
          {crmCopy.backToPipeline}
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
        <div className="space-y-5">
          {writable ? (
            <form
              action={updateDealStageAction}
              className="rounded-[22px] border border-[var(--line)] bg-white/40 p-4"
            >
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <input type="hidden" name="dealId" value={deal.id} />
              <input type="hidden" name="view" value="deal-room" />
              <select
                name="stage"
                defaultValue={deal.stage}
                className="w-full rounded-xl border border-[var(--line)] bg-white/65 px-3 py-2 text-sm"
              >
                {DEAL_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {DEAL_STAGE_COPY[stage].de} / {DEAL_STAGE_COPY[stage].en}
                  </option>
                ))}
              </select>
              <button className="mt-3 rounded-xl bg-[var(--ink)] px-4 py-2 text-sm text-white">
                {crmCopy.save}
              </button>
            </form>
          ) : null}

          <section className="rounded-[22px] border border-[var(--line)] bg-white/35 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              {crmCopy.contacts}
            </h2>
            <div className="mt-3 space-y-2">
              <div className="rounded-xl border border-[var(--line)] bg-white/55 px-3 py-2">
                <p className="text-sm font-medium">{deal.ownerName}</p>
                <p className="text-xs text-[var(--muted)]">{crmCopy.owner}</p>
              </div>
              {participants.map((name) => (
                <div
                  key={name}
                  className="rounded-xl border border-[var(--line)] bg-white/55 px-3 py-2"
                >
                  <p className="text-sm font-medium">{name}</p>
                  <p className="text-xs text-[var(--muted)]">Agent</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[22px] border border-[var(--line)] bg-white/35 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              {crmCopy.approvals}
            </h2>
            <div className="mt-3 space-y-2">
              {data.dealApprovals.map((approval) => (
                <div
                  key={approval.id}
                  className="rounded-xl border border-[var(--line)] bg-white/55 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{approval.safeSummary}</p>
                    <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      {approval.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    {timeLabel(approval.createdAt)}
                  </p>
                </div>
              ))}
              {!data.dealApprovals.length ? (
                <p className="text-xs leading-5 text-[var(--muted)]">{crmCopy.noApprovals}</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-[22px] border border-[var(--line)] bg-white/35 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              {crmCopy.thread}
            </h2>
            <div className="mt-4 space-y-4">
              {data.dealMessages.length ? (
                data.dealMessages.map((message) => {
                  const template = message.agentCode
                    ? AGENT_TEMPLATES.find((agent) => agent.code === message.agentCode)
                    : null;
                  const label =
                    message.role === "user"
                      ? "Du"
                      : (template?.name ?? (message.role === "system" ? "Zeus" : "Agent"));
                  return (
                    <article key={message.id}>
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
                        {label}
                      </p>
                      <p
                        className={
                          message.role === "user"
                            ? "rounded-[18px] bg-[#e8e3d9] px-4 py-3 text-sm leading-6"
                            : "text-sm leading-6 text-[var(--muted)]"
                        }
                      >
                        {message.content}
                      </p>
                    </article>
                  );
                })
              ) : (
                <EmptyState
                  title={deal.conversationId ? crmCopy.noMessages : crmCopy.noConversation}
                  detail={crmCopy.dealRoomDetail}
                />
              )}
            </div>
            {conversationWritable && deal.conversationId ? (
              <form
                action={sendDealMessageAction}
                className="sticky bottom-4 mt-5 rounded-[20px] border border-[var(--line)] bg-white/90 p-3"
              >
                <input type="hidden" name="workspaceId" value={workspace.id} />
                <input type="hidden" name="dealId" value={deal.id} />
                <input type="hidden" name="conversationId" value={deal.conversationId} />
                <textarea
                  required
                  maxLength={20000}
                  name="message"
                  rows={2}
                  placeholder={crmCopy.threadPlaceholder}
                  className="w-full resize-none bg-transparent px-2 py-2 text-sm outline-none"
                />
                <div className="flex items-center justify-end">
                  <button className="rounded-full bg-[var(--ink)] px-4 py-1.5 text-xs font-medium text-white">
                    {crmCopy.send}
                  </button>
                </div>
              </form>
            ) : null}
          </section>
        </div>

        <AgentRunsPanel data={data} deal={deal} canWrite={writable} />
      </div>
    </div>
  );
}
