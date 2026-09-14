"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface CommandPaletteProps {
  workspaceId: string;
  agents: readonly { code: string; name: string; enabled: boolean; conversationId?: string }[];
}

export function CommandPalette({ workspaceId, agents }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const commands = useMemo(
    () => [
      { label: "Workspace home", href: `/app?workspace=${workspaceId}` },
      { label: "New task", href: `/app?workspace=${workspaceId}&view=tasks#new-task` },
      { label: "New conversation", href: `/app?workspace=${workspaceId}&view=team#team-chat` },
      { label: "Upload file", href: `/app?workspace=${workspaceId}&view=files#upload-file` },
      { label: "Search workspace", href: `/app?workspace=${workspaceId}&view=search` },
      { label: "Go to artifacts", href: `/app?workspace=${workspaceId}&view=artifacts` },
      { label: "Go to activity", href: `/app?workspace=${workspaceId}&view=activity` },
      { label: "Open memory", href: `/app?workspace=${workspaceId}&view=memory` },
      ...agents
        .filter((agent) => agent.enabled && agent.conversationId)
        .map((agent) => ({
          label: `Open ${agent.name}`,
          href: `/app?workspace=${workspaceId}&conversation=${agent.conversationId}`,
        })),
    ],
    [agents, workspaceId],
  );

  const filtered = commands.filter((command) =>
    command.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="command-trigger rounded-xl border border-[var(--line)] bg-white/55 px-3 py-2 text-xs text-[var(--muted)]"
        aria-label="Open command palette"
      >
        ⌘K
      </button>
      {open ? (
        <div className="command-backdrop fixed inset-0 z-50 grid place-items-start bg-black/20 px-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
          <div
            className="w-full max-w-xl overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--paper)] shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Jump somewhere or start work…"
              className="w-full border-b border-[var(--line)] bg-transparent px-5 py-4 text-sm outline-none"
            />
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {filtered.length ? (
                filtered.map((command) => (
                  <Link
                    key={`${command.label}:${command.href}`}
                    href={command.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-3 py-3 text-sm hover:bg-white/70"
                  >
                    {command.label}
                  </Link>
                ))
              ) : (
                <p className="px-3 py-8 text-center text-sm text-[var(--muted)]">No matching command.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
