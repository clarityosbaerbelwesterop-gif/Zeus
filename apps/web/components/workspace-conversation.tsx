import { AGENT_TEMPLATES } from "@zeus/agents";
import { can } from "@zeus/workspace";
import Link from "next/link";
import { sendMessageAction } from "@/app/app/actions";
import type { WorkspacePageData } from "@/lib/product";
import { EmptyState, workspaceHref } from "./workspace-ui";
import { participantNames } from "./workspace-team";

export function ConversationView({ data }: { data: WorkspacePageData }) {
  const workspace = data.activeWorkspace;
  const conversation = data.activeConversation;
  if (!workspace || !conversation) return null;
  const participants = participantNames(data, conversation.id);
  const writable = Boolean(data.membershipRole && can(data.membershipRole, "conversation.write"));

  return (
    <div className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-[850px] flex-col">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">{conversation.title}</h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {conversation.type.replaceAll("_", " ")}
            {participants ? ` · ${participants}` : ""}
          </p>
        </div>
        <Link href={workspaceHref(workspace.id)} className="text-xs text-[var(--muted)]">
          Back to workspace
        </Link>
      </div>

      <div className="flex-1 space-y-5">
        {data.messages.length ? (
          data.messages.map((message) => {
            const template = message.agentCode
              ? AGENT_TEMPLATES.find((agent) => agent.code === message.agentCode)
              : null;
            const label =
              message.role === "user"
                ? "You"
                : (template?.name ?? (message.role === "system" ? "Zeus" : "Agent"));
            return (
              <article
                key={message.id}
                className={message.role === "user" ? "ml-auto max-w-[82%]" : "max-w-[86%]"}
              >
                <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
                  {label}
                </p>
                <div
                  className={
                    message.role === "user"
                      ? "rounded-[20px] bg-[#e8e3d9] px-4 py-3 text-sm leading-6"
                      : "text-sm leading-7 text-[var(--muted)]"
                  }
                >
                  {message.content}
                </div>
              </article>
            );
          })
        ) : (
          <EmptyState
            title="No messages yet"
            detail="Start the conversation. Messages persist across reloads and Zeus will not invent agent replies without a configured provider."
          />
        )}
      </div>

      {writable ? (
        <form
          action={sendMessageAction}
          className="sticky bottom-4 mt-8 rounded-[22px] border border-[var(--line)] bg-white/90 p-3 shadow-[0_16px_50px_rgba(50,45,35,.08)]"
        >
          <input type="hidden" name="conversationId" value={conversation.id} />
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <textarea
            required
            maxLength={20000}
            name="message"
            rows={2}
            placeholder="Give the team real work…"
            className="w-full resize-none bg-transparent px-2 py-2 text-sm outline-none"
          />
          <div className="flex items-center justify-between gap-4 px-2">
            <span className="text-[11px] text-[var(--muted)]">
              Safe output and operational events are persisted. Hidden reasoning is not.
            </span>
            <button className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-white">
              ↑
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-8 rounded-xl border border-[var(--line)] p-3 text-sm text-[var(--muted)]">
          Viewer access is read-only.
        </p>
      )}
    </div>
  );
}
