import { AGENT_TEMPLATES, type AgentCode } from "@zeus/agents";
import Link from "next/link";
import { AgentMark } from "./agent-mark";
import {
  createConversationAction,
  createWorkspaceAction,
  sendMessageAction,
  toggleAgentAction,
} from "@/app/app/actions";
import type { AwaitedReturn } from "@/lib/types";
import type { workspacePageData } from "@/lib/product";

type Data = AwaitedReturn<typeof workspacePageData>;

export function AppShell({ data }: { data: Data }) {
  if (!data.activeWorkspace) return <EmptyWorkspace />;
  const workspace = data.activeWorkspace;
  const activeAgent = data.activeConversation?.agentCode
    ? AGENT_TEMPLATES.find((a) => a.code === data.activeConversation?.agentCode)
    : null;
  return (
    <main className="workspace-grid grid min-h-screen grid-cols-[250px_minmax(0,1fr)_310px] bg-[var(--paper)]">
      <aside className="workspace-sidebar border-r border-[var(--line)] p-4 md:p-5">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold">
            ZEUS
          </Link>
          <span className="sidebar-label text-xs text-[var(--muted)]">
            {data.account.user.name ?? "Account"}
          </span>
        </div>
        <div className="sidebar-label mb-2 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Workspaces
        </div>
        <div className="space-y-1">
          {data.workspaces.map((item) => (
            <Link
              key={item.id}
              href={`/app?workspace=${item.id}`}
              className={`block rounded-xl px-3 py-2.5 text-sm ${item.id === workspace.id ? "bg-white/75 font-medium" : "text-[var(--muted)] hover:bg-white/45"}`}
            >
              <span className="sidebar-label">{item.name}</span>
              <span className="hidden max-[900px]:inline">
                {item.name.slice(0, 2).toUpperCase()}
              </span>
            </Link>
          ))}
        </div>
        <div className="sidebar-label mt-7 mb-2 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Teammates
        </div>
        <div className="space-y-1">
          {data.agents
            .filter((a) => a.enabled)
            .map((a) => (
              <form key={a.code} action={createConversationAction}>
                <input type="hidden" name="workspaceId" value={workspace.id} />
                <input type="hidden" name="agent" value={a.code} />
                <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/55">
                  <AgentMark
                    agent={{ code: a.code as AgentCode, name: a.name, accent: a.accent }}
                    size={32}
                  />
                  <span className="sidebar-label">
                    <span className="block text-sm font-medium">{a.name}</span>
                    <span className="block max-w-36 truncate text-[11px] text-[var(--muted)]">
                      {a.role}
                    </span>
                  </span>
                </button>
              </form>
            ))}
        </div>
        <form action={createConversationAction} className="sidebar-label mt-3">
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <button className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-left text-sm">
            + Team conversation
          </button>
        </form>
        <div className="sidebar-label mt-8 mb-2 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
          Conversations
        </div>
        <div className="sidebar-label space-y-1">
          {data.conversations.slice(0, 8).map((conversation) => (
            <Link
              key={conversation.id}
              href={`/app?workspace=${workspace.id}&conversation=${conversation.id}`}
              className={`block truncate rounded-xl px-3 py-2 text-sm ${conversation.id === data.activeConversation?.id ? "bg-white/70" : "text-[var(--muted)]"}`}
            >
              {conversation.title}
            </Link>
          ))}
        </div>
      </aside>

      <section className="flex min-h-screen min-w-0 flex-col">
        <header className="flex h-[70px] items-center justify-between border-b border-[var(--line)] px-5 md:px-7">
          <div>
            <p className="text-sm font-semibold">{workspace.name}</p>
            <p className="text-xs text-[var(--muted)]">
              {activeAgent
                ? `${activeAgent.name} · ${activeAgent.role}`
                : data.activeConversation
                  ? "Team conversation"
                  : "Choose a teammate"}
            </p>
          </div>
          <span className="rounded-full border border-[var(--line)] bg-white/50 px-3 py-1.5 text-xs text-[var(--muted)]">
            M1 · provider {process.env.OPENROUTER_API_KEY ? "configured" : "not configured"}
          </span>
        </header>
        <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col px-5 py-8 md:px-8">
          {data.activeConversation ? (
            <>
              <div className="flex-1 space-y-6">
                {data.messages.length ? (
                  data.messages.map((message) => (
                    <article
                      key={message.id}
                      className={
                        message.role === "user"
                          ? "ml-auto max-w-[78%] rounded-[20px] bg-[#e8e3d9] px-4 py-3 text-sm leading-6"
                          : "max-w-[82%] text-sm leading-7 text-[var(--muted)]"
                      }
                    >
                      {message.role === "system" ? (
                        <span className="mb-1 block text-[11px] uppercase tracking-widest">
                          System state
                        </span>
                      ) : null}
                      {message.content}
                    </article>
                  ))
                ) : (
                  <div className="pt-20 text-center">
                    <div className="mx-auto mb-5 w-fit">
                      {activeAgent ? <AgentMark agent={activeAgent} size={54} /> : null}
                    </div>
                    <h1 className="text-4xl font-semibold tracking-[-0.04em]">
                      {activeAgent ? `Work with ${activeAgent.name}` : "Give the team a goal"}
                    </h1>
                    <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--muted)]">
                      Messages and run state persist. Until a model provider is connected, Zeus will
                      wait rather than invent work.
                    </p>
                  </div>
                )}
              </div>
              <form
                action={sendMessageAction}
                className="sticky bottom-5 mt-8 rounded-[22px] border border-[var(--line)] bg-white/90 p-3 shadow-[0_16px_50px_rgba(50,45,35,.08)]"
              >
                <input type="hidden" name="conversationId" value={data.activeConversation.id} />
                <input type="hidden" name="workspaceId" value={workspace.id} />
                <textarea
                  required
                  maxLength={20000}
                  name="message"
                  rows={2}
                  placeholder="Give Zeus real work…"
                  className="w-full resize-none bg-transparent px-2 py-2 text-sm outline-none"
                />
                <div className="flex items-center justify-between px-2">
                  <span className="text-[11px] text-[var(--muted)]">
                    Operational activity is visible. Private reasoning is not.
                  </span>
                  <button className="grid size-9 place-items-center rounded-full bg-[var(--ink)] text-white">
                    ↑
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center">
              <div className="max-w-md text-center">
                <h1 className="text-4xl font-semibold tracking-[-0.04em]">
                  Start with a teammate.
                </h1>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  Choose Kai, Jorge, Lora, Simon, Sara or create a team conversation from the
                  sidebar.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <aside className="activity-rail border-l border-[var(--line)] p-6">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Activity</p>
          <span className="size-2 rounded-full bg-[#9f9b91]" />
        </div>
        {data.runs.length ? (
          <div className="mt-7">
            <p className="text-sm font-medium">{data.runs[0]?.objective}</p>
            <p className="mt-1 text-xs uppercase tracking-wider text-[var(--muted)]">
              {data.runs[0]?.status}
            </p>
            <div className="mt-6 space-y-5 border-l border-[var(--line)] pl-5">
              {data.steps.map((step) => (
                <div key={step.id}>
                  <p className="text-sm">{step.title}</p>
                  {step.safeDetail ? (
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{step.safeDetail}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-7 text-sm leading-6 text-[var(--muted)]">
            Run steps, tool use, artifacts and verification will appear here as work happens.
          </p>
        )}
        <div className="mt-10 border-t border-[var(--line)] pt-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            Enabled team
          </p>
          <div className="mt-4 space-y-2">
            {data.agents.map((agent) => (
              <form
                action={toggleAgentAction}
                key={agent.code}
                className="flex items-center justify-between"
              >
                <input type="hidden" name="workspaceId" value={workspace.id} />
                <input type="hidden" name="agent" value={agent.code} />
                <input type="hidden" name="enabled" value={String(!agent.enabled)} />
                <span className="text-sm">{agent.name}</span>
                <button
                  aria-label={`${agent.enabled ? "Disable" : "Enable"} ${agent.name}`}
                  className={`h-5 w-9 rounded-full p-0.5 ${agent.enabled ? "bg-[var(--ink)]" : "bg-[#d5d0c6]"}`}
                >
                  <span
                    className={`block size-4 rounded-full bg-white transition ${agent.enabled ? "translate-x-4" : "translate-x-0"}`}
                  />
                </button>
              </form>
            ))}
          </div>
        </div>
      </aside>
    </main>
  );
}

function EmptyWorkspace() {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          ZEUS · first workspace
        </p>
        <h1 className="mt-4 text-5xl font-semibold tracking-[-0.05em]">
          Who should work with you?
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
          Create a workspace and enable only the teammates it needs. Nothing is duplicated; Zeus
          references the canonical system agents.
        </p>
        <form action={createWorkspaceAction} className="mt-10 space-y-5">
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
            placeholder="What is this workspace responsible for?"
            className="w-full rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {AGENT_TEMPLATES.map((agent) => (
              <label
                key={agent.code}
                className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/40 p-3"
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
          <button className="rounded-full bg-[var(--ink)] px-6 py-3 text-sm font-semibold text-white">
            Create workspace
          </button>
        </form>
      </div>
    </main>
  );
}
