import { MEMORY_TYPES } from "@zeus/workspace";
import { archiveMemoryAction, createMemoryAction } from "@/app/app/actions";
import type { WorkspacePageData } from "@/lib/product";
import { EmptyState, eventDetail, SectionHeader, timeLabel } from "./workspace-ui";

export function MemoryView({ data, canWrite }: { data: WorkspacePageData; canWrite: boolean }) {
  const workspace = data.activeWorkspace;
  if (!workspace) return null;
  const nonDecisions = data.memory.filter((memory) => memory.type !== "decision");

  return (
    <div className="mx-auto max-w-5xl">
      <SectionHeader
        eyebrow="Workspace memory"
        title="The things worth remembering"
        detail="Zeus does not silently dump every chat into memory. Goals, decisions, facts, preferences, constraints and project context are explicit durable state."
      />
      {canWrite ? (
        <form
          action={createMemoryAction}
          className="mb-7 grid gap-2 rounded-[22px] border border-[var(--line)] bg-white/35 p-4 sm:grid-cols-[.55fr_1fr_1.5fr_auto]"
        >
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <select
            name="type"
            defaultValue="decision"
            className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
          >
            {MEMORY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <input
            required
            name="title"
            maxLength={240}
            placeholder="Decision title"
            className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
          />
          <input
            required
            name="content"
            maxLength={20000}
            placeholder="What should the team remember?"
            className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
          />
          <button className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm text-white">Store</button>
        </form>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Decision log</h2>
        <div className="space-y-2">
          {data.decisions.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              workspaceId={workspace.id}
              canWrite={canWrite}
            />
          ))}
          {!data.decisions.length ? (
            <EmptyState
              title="No decisions yet"
              detail="Record important choices and why they were made."
            />
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">All memory</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {nonDecisions.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              workspaceId={workspace.id}
              canWrite={canWrite}
            />
          ))}
          {!nonDecisions.length ? (
            <EmptyState
              title="No memory yet"
              detail="Store important project decisions and constraints."
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

function MemoryCard({
  memory,
  workspaceId,
  canWrite,
}: {
  memory: WorkspacePageData["memory"][number];
  workspaceId: string;
  canWrite: boolean;
}) {
  return (
    <article className="rounded-2xl border border-[var(--line)] bg-white/35 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {memory.type.replaceAll("_", " ")}
          </p>
          <h3 className="mt-1 text-sm font-semibold">{memory.title}</h3>
        </div>
        <span className="text-[11px] text-[var(--muted)]">{timeLabel(memory.updatedAt)}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">
        {memory.content}
      </p>
      {memory.sourceType ? (
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Source: {memory.sourceType}
          {memory.sourceId ? ` · ${memory.sourceId}` : ""}
        </p>
      ) : null}
      {canWrite ? (
        <form action={archiveMemoryAction} className="mt-3">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="memoryId" value={memory.id} />
          <button className="text-xs text-[var(--muted)] underline underline-offset-4">
            Archive
          </button>
        </form>
      ) : null}
    </article>
  );
}

export function ActivityView({ data }: { data: WorkspacePageData }) {
  return (
    <div className="mx-auto max-w-4xl">
      <SectionHeader
        eyebrow="Activity"
        title="What actually happened"
        detail="This timeline is built from persisted operational events. Security audit evidence stays a separate authority."
      />
      <div className="relative space-y-0 border-l border-[var(--line)] pl-6">
        {data.activity.map((event) => {
          const detail = eventDetail(event.safePayload);
          return (
            <div key={event.id} className="relative pb-6">
              <span className="absolute -left-[29px] top-1.5 size-2 rounded-full bg-[var(--ink)]" />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">{event.eventType.replaceAll(".", " ")}</p>
                <time className="text-xs text-[var(--muted)]">{timeLabel(event.createdAt)}</time>
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {event.actorType}
                {event.actorId ? ` · ${event.actorId.slice(0, 12)}` : ""} · {event.entityType}
              </p>
              {detail ? (
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{detail}</p>
              ) : null}
            </div>
          );
        })}
        {!data.activity.length ? (
          <EmptyState
            title="No activity yet"
            detail="Workspace events will appear as real work happens."
          />
        ) : null}
      </div>
    </div>
  );
}
