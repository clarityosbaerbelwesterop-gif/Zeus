import type { WorkspacePageData, WorkspaceSearchItem } from "@/lib/product";
import { EmptyState, SearchResult, SectionHeader } from "./workspace-ui";

export function SearchView({ data }: { data: WorkspacePageData }) {
  const workspace = data.activeWorkspace;
  if (!workspace) return null;
  const groups = new Map<string, WorkspaceSearchItem[]>();
  for (const result of data.searchResults) {
    groups.set(result.type, [...(groups.get(result.type) ?? []), result]);
  }
  const globalResults = data.globalSearchResults
    .filter((result) => result.workspaceId !== workspace.id || result.type === "workspace")
    .slice(0, 20);

  return (
    <div className="mx-auto max-w-5xl">
      <SectionHeader
        eyebrow="Search"
        title="Find work, not tables"
        detail="Workspace search covers conversations, messages, deals, tasks, plans, files, artifacts and memory. Global results stay clearly separated."
      />
      <form method="get" action="/app" className="mb-7 flex gap-2">
        <input type="hidden" name="workspace" value={workspace.id} />
        <input type="hidden" name="view" value="search" />
        <input
          autoFocus
          name="q"
          defaultValue={data.searchQuery}
          maxLength={120}
          placeholder="Search for OAuth, a decision, a file…"
          className="min-w-0 flex-1 rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3 text-sm outline-none"
        />
        <button className="rounded-2xl bg-[var(--ink)] px-5 py-3 text-sm text-white">Search</button>
      </form>

      {data.searchQuery.length >= 2 ? (
        <>
          <h2 className="mb-3 text-lg font-semibold">This workspace</h2>
          <div className="space-y-5">
            {[...groups.entries()].map(([type, results]) => (
              <section key={type}>
                <p className="mb-2 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
                  {type}
                </p>
                <div className="space-y-2">
                  {results.map((result) => (
                    <SearchResult key={`${result.type}:${result.id}`} result={result} />
                  ))}
                </div>
              </section>
            ))}
            {!data.searchResults.length ? (
              <EmptyState
                title="No workspace matches"
                detail="Try a different phrase. Search is bounded and server-side."
              />
            ) : null}
          </div>

          <h2 className="mt-10 mb-3 text-lg font-semibold">Across Zeus</h2>
          <div className="space-y-2">
            {globalResults.map((result) => (
              <SearchResult key={`global:${result.type}:${result.id}`} result={result} />
            ))}
            {!globalResults.length ? (
              <p className="text-sm text-[var(--muted)]">No matches in your other workspaces.</p>
            ) : null}
          </div>
        </>
      ) : (
        <EmptyState
          title="Search your workspace"
          detail="Type at least two characters. Results are grouped and capped instead of scanning everything on each keystroke."
        />
      )}
    </div>
  );
}
