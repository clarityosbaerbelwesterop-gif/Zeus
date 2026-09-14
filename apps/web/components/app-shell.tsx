import { type AgentCode } from "@zeus/agents";
import { can } from "@zeus/workspace";
import Link from "next/link";
import type { WorkspacePageData } from "@/lib/product";
import { AgentMark } from "./agent-mark";
import { CommandPalette } from "./command-palette";
import { ConversationView } from "./workspace-conversation";
import { WorkspaceCreateForm } from "./workspace-create-form";
import { ArtifactsView, FilesView } from "./workspace-files-artifacts";
import { WorkspaceHome } from "./workspace-home";
import { ActivityView, MemoryView } from "./workspace-memory-activity";
import { PlansView } from "./workspace-plans";
import { SearchView } from "./workspace-search";
import { SettingsView } from "./workspace-settings";
import { participantNames, TeamView } from "./workspace-team";
import { TasksView } from "./workspace-tasks";
import { timeLabel, workspaceHref } from "./workspace-ui";

const viewLabels: Record<string, string> = {
  home: "Workspace",
  team: "Team",
  tasks: "Tasks",
  plans: "Plans",
  files: "Files",
  artifacts: "Artifacts",
  memory: "Memory",
  activity: "Activity",
  search: "Search",
  settings: "Settings",
};

export function AppShell({ data }: { data: WorkspacePageData }) {
  if (!data.activeWorkspace) return <EmptyWorkspace />;
  const workspace = data.activeWorkspace;
  const selectedView = data.activeConversation
    ? "conversation"
    : viewLabels[data.view]
      ? data.view
      : "home";
  const directConversationByAgent = new Map(
    data.conversations
      .filter((conversation) => conversation.type === "direct_agent" && conversation.agentCode)
      .map((conversation) => [conversation.agentCode as string, conversation]),
  );
  const teamConversation = data.conversations.find((conversation) => conversation.type === "team");
  const paletteAgents = data.agents.map((agent) => {
    const direct = directConversationByAgent.get(agent.code);
    return {
      code: agent.code,
      name: agent.name,
      enabled: agent.enabled,
      ...(direct ? { conversationId: direct.id } : {}),
    };
  });
  const role = data.membershipRole;
  const canWrite = Boolean(role && can(role, "task.write"));
  const canManage = Boolean(role && can(role, "workspace.manage"));

  return (
    <main className="workspace-grid grid min-h-screen grid-cols-[252px_minmax(0,1fr)_300px] bg-[var(--paper)]">
      <aside className="workspace-sidebar border-r border-[var(--line)] p-4 md:p-5">
        <div className="mb-5 flex items-center justify-between gap-2">
          <Link href="/" className="text-sm font-semibold tracking-[0.08em]">
            ZEUS
          </Link>
          <CommandPalette workspaceId={workspace.id} agents={paletteAgents} />
        </div>

        <details className="workspace-switcher group mb-5">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl bg-white/55 px-3 py-2.5 text-sm font-medium">
            <span className="truncate">{workspace.name}</span>
            <span className="text-[var(--muted)]">⌄</span>
          </summary>
          <div className="mt-1 space-y-1 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-1">
            {data.workspaces.map((item) => (
              <Link
                key={item.id}
                href={workspaceHref(item.id)}
                className={`block rounded-lg px-3 py-2 text-sm ${
                  item.id === workspace.id
                    ? "bg-white font-medium"
                    : "text-[var(--muted)] hover:bg-white/60"
                }`}
              >
                {item.name}
              </Link>
            ))}
            <Link
              href="/app/new"
              className="block rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-white/60"
            >
              + New workspace
            </Link>
          </div>
        </details>

        <form
          method="get"
          action="/app"
          className="sidebar-search mb-5 flex rounded-xl border border-[var(--line)] bg-white/40 px-3 py-2"
        >
          <input type="hidden" name="workspace" value={workspace.id} />
          <input type="hidden" name="view" value="search" />
          <input
            name="q"
            defaultValue={data.searchQuery}
            placeholder="Search workspace"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          />
        </form>

        <nav className="sidebar-nav space-y-1">
          <SidebarLink href={workspaceHref(workspace.id)} active={selectedView === "home"} label="Home" />
          <SidebarLink href={workspaceHref(workspace.id, "team")} active={selectedView === "team"} label="Team" />
          <SidebarLink href={workspaceHref(workspace.id, "tasks")} active={selectedView === "tasks"} label="Tasks" />
          <SidebarLink href={workspaceHref(workspace.id, "plans")} active={selectedView === "plans"} label="Plans" />
          <SidebarLink href={workspaceHref(workspace.id, "files")} active={selectedView === "files"} label="Files" />
          <SidebarLink href={workspaceHref(workspace.id, "artifacts")} active={selectedView === "artifacts"} label="Artifacts" />
          <SidebarLink href={workspaceHref(workspace.id, "memory")} active={selectedView === "memory"} label="Memory" />
          <SidebarLink href={workspaceHref(workspace.id, "activity")} active={selectedView === "activity"} label="Activity" />
        </nav>

        <div className="sidebar-label mt-7 mb-2 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Team</div>
        <div className="space-y-1">
          {data.agents
            .filter((agent) => agent.enabled)
            .map((agent) => {
              const direct = directConversationByAgent.get(agent.code);
              return direct ? (
                <Link
                  key={agent.code}
                  href={`/app?workspace=${workspace.id}&conversation=${direct.id}`}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/55"
                >
                  <AgentMark
                    agent={{ code: agent.code as AgentCode, name: agent.name, accent: agent.accent }}
                    size={30}
                  />
                  <span className="sidebar-label min-w-0">
                    <span className="block text-sm font-medium">{agent.name}</span>
                    <span className="block truncate text-[11px] capitalize text-[var(--muted)]">{agent.presence}</span>
                  </span>
                </Link>
              ) : null;
            })}
        </div>
        {teamConversation ? (
          <Link
            href={`/app?workspace=${workspace.id}&conversation=${teamConversation.id}`}
            className="sidebar-label mt-2 block rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          >
            Team chat
          </Link>
        ) : null}

        <Link
          href={workspaceHref(workspace.id, "settings")}
          className="sidebar-label mt-8 block rounded-xl px-3 py-2 text-sm text-[var(--muted)] hover:bg-white/45"
        >
          Workspace settings
        </Link>
      </aside>

      <section className="flex min-h-screen min-w-0 flex-col">
        <header className="workspace-header flex min-h-[70px] items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-3 md:px-7">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{workspace.name}</p>
            <p className="truncate text-xs text-[var(--muted)]">
              {data.activeConversation
                ? `${data.activeConversation.title}${participantNames(data, data.activeConversation.id) ? ` · ${participantNames(data, data.activeConversation.id)}` : ""}`
                : (viewLabels[selectedView] ?? "Workspace")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full border border-[var(--line)] bg-white/50 px-3 py-1.5 text-xs text-[var(--muted)] sm:inline">
              {role?.toUpperCase()}
            </span>
            <span className="rounded-full border border-[var(--line)] bg-white/50 px-3 py-1.5 text-xs text-[var(--muted)]">
              AI {process.env.OPENROUTER_API_KEY ? "ready" : "not configured"}
            </span>
          </div>
        </header>

        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-8">
          {data.activeConversation ? (
            <ConversationView data={data} />
          ) : selectedView === "team" ? (
            <TeamView data={data} directConversationByAgent={directConversationByAgent} canManage={canManage} />
          ) : selectedView === "tasks" ? (
            <TasksView data={data} canWrite={canWrite} />
          ) : selectedView === "plans" ? (
            <PlansView data={data} canWrite={canWrite} />
          ) : selectedView === "files" ? (
            <FilesView data={data} canWrite={canWrite} />
          ) : selectedView === "artifacts" ? (
            <ArtifactsView data={data} canWrite={canWrite} />
          ) : selectedView === "memory" ? (
            <MemoryView data={data} canWrite={canWrite} />
          ) : selectedView === "activity" ? (
            <ActivityView data={data} />
          ) : selectedView === "settings" ? (
            <SettingsView data={data} canManage={canManage} />
          ) : selectedView === "search" ? (
            <SearchView data={data} />
          ) : (
            <WorkspaceHome data={data} />
          )}
        </div>
      </section>

      <aside className="activity-rail border-l border-[var(--line)] p-5 xl:p-6">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Now</p>
          <span className="size-2 rounded-full bg-[#8f8b82]" />
        </div>
        <p className="mt-5 text-sm font-medium">{workspace.currentFocus || workspace.objective || "No current focus set."}</p>
        <div className="mt-8 space-y-4">
          {data.agents
            .filter((agent) => agent.enabled)
            .map((agent) => (
              <div key={agent.code} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <AgentMark
                    agent={{ code: agent.code as AgentCode, name: agent.name, accent: agent.accent }}
                    size={28}
                  />
                  <span className="truncate text-sm">{agent.name}</span>
                </div>
                <span className="text-xs capitalize text-[var(--muted)]">{agent.presence}</span>
              </div>
            ))}
        </div>
        <div className="mt-8 border-t border-[var(--line)] pt-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">Recent activity</p>
          <div className="mt-4 space-y-4">
            {data.activity.slice(0, 5).map((event) => (
              <div key={event.id}>
                <p className="text-xs font-medium">{event.eventType.replaceAll(".", " ")}</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">{timeLabel(event.createdAt)}</p>
              </div>
            ))}
            {!data.activity.length ? (
              <p className="text-xs leading-5 text-[var(--muted)]">Real workspace events will appear here.</p>
            ) : null}
          </div>
        </div>
      </aside>
    </main>
  );
}

function SidebarLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`block rounded-xl px-3 py-2.5 text-sm ${
        active ? "bg-white/75 font-medium" : "text-[var(--muted)] hover:bg-white/45"
      }`}
    >
      {label}
    </Link>
  );
}

function EmptyWorkspace() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">ZEUS · first workspace</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Give your team a place to remember.</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)]">
          A workspace owns the objective, team, conversations, tasks, files, artifacts, memory and activity. It persists when the chat closes.
        </p>
        <div className="mt-9">
          <WorkspaceCreateForm />
        </div>
      </div>
    </main>
  );
}
