import { AGENT_TEMPLATES, type AgentCode } from "@zeus/agents";
import Link from "next/link";
import { createConversationAction, toggleAgentAction } from "@/app/app/actions";
import type { WorkspacePageData } from "@/lib/product";
import { AgentMark } from "./agent-mark";
import { SectionHeader } from "./workspace-ui";

export function TeamView({
  data,
  directConversationByAgent,
  canManage,
}: {
  data: WorkspacePageData;
  directConversationByAgent: Map<string, WorkspacePageData["conversations"][number]>;
  canManage: boolean;
}) {
  const workspace = data.activeWorkspace;
  if (!workspace) return null;
  return (
    <div className="mx-auto max-w-6xl">
      <SectionHeader
        eyebrow="Team"
        title="Your AI company"
        detail="Agent availability comes from real run state. Zeus never animates fake work."
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.agents.map((agent) => {
          const direct = directConversationByAgent.get(agent.code);
          return (
            <article
              key={agent.code}
              className={`rounded-[22px] border border-[var(--line)] p-5 ${agent.enabled ? "bg-white/45" : "bg-transparent opacity-65"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AgentMark
                    agent={{ code: agent.code as AgentCode, name: agent.name, accent: agent.accent }}
                    size={42}
                  />
                  <div>
                    <h2 className="font-semibold">{agent.name}</h2>
                    <p className="text-xs text-[var(--muted)]">{agent.role}</p>
                  </div>
                </div>
                <span className="text-xs capitalize text-[var(--muted)]">
                  {agent.enabled ? agent.presence : "unavailable"}
                </span>
              </div>
              <p className="mt-4 min-h-12 text-sm leading-6 text-[var(--muted)]">{agent.purpose}</p>
              {agent.currentRun ? (
                <div className="mt-4 rounded-xl bg-white/55 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Current task</p>
                  <p className="mt-1 line-clamp-2 text-sm">{agent.currentRun.objective}</p>
                </div>
              ) : null}
              <div className="mt-5 flex items-center gap-2">
                {agent.enabled && direct ? (
                  <Link
                    href={`/app?workspace=${workspace.id}&conversation=${direct.id}`}
                    className="rounded-full bg-[var(--ink)] px-4 py-2 text-xs font-medium text-white"
                  >
                    Open chat
                  </Link>
                ) : null}
                {canManage ? (
                  <form action={toggleAgentAction}>
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <input type="hidden" name="agent" value={agent.code} />
                    <input type="hidden" name="enabled" value={String(!agent.enabled)} />
                    <button className="rounded-full border border-[var(--line)] px-4 py-2 text-xs">
                      {agent.enabled ? "Remove" : "Add"}
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <section id="team-chat" className="mt-8 rounded-[22px] border border-[var(--line)] bg-white/35 p-5">
        <h2 className="text-lg font-semibold">Team conversations</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Participants are persisted explicitly so every future agent message can carry a real identity.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.conversations
            .filter((conversation) => conversation.type === "team")
            .map((conversation) => (
              <Link
                key={conversation.id}
                href={`/app?workspace=${workspace.id}&conversation=${conversation.id}`}
                className="rounded-xl border border-[var(--line)] bg-white/50 px-4 py-3 text-sm"
              >
                {conversation.title}
              </Link>
            ))}
        </div>
        {canManage ? (
          <form action={createConversationAction} className="mt-4 flex max-w-lg gap-2">
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <input
              name="title"
              maxLength={240}
              placeholder="Launch planning"
              className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-white/55 px-3 py-2 text-sm"
            />
            <button className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm text-white">Create</button>
          </form>
        ) : null}
      </section>
    </div>
  );
}

export function participantNames(data: WorkspacePageData, conversationId: string): string {
  return data.participants
    .filter((participant) => participant.conversationId === conversationId)
    .map((participant) => AGENT_TEMPLATES.find((agent) => agent.code === participant.agentCode)?.name)
    .filter((value): value is string => Boolean(value))
    .join(", ");
}
