import Link from "next/link";
import type { WorkspaceSearchItem } from "@/lib/product";

export function workspaceHref(
  workspaceId: string,
  view?: string,
  extra?: Record<string, string>,
): string {
  const params = new URLSearchParams({ workspace: workspaceId });
  if (view && view !== "home") params.set("view", view);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  return `/app?${params.toString()}`;
}

export function timeLabel(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function eventDetail(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  return Object.entries(payload as Record<string, unknown>)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value) || value === null)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

export function SectionHeader({
  eyebrow,
  title,
  detail,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
}) {
  return (
    <div className="mb-6">
      {eyebrow ? (
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">{eyebrow}</p>
      ) : null}
      <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h1>
      {detail ? (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{detail}</p>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--line)] p-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[var(--muted)]">{detail}</p>
    </div>
  );
}

export function SearchResult({ result }: { result: WorkspaceSearchItem }) {
  const href =
    result.type === "workspace"
      ? workspaceHref(result.workspaceId)
      : result.type === "conversation"
        ? `/app?workspace=${result.workspaceId}&conversation=${result.id}`
        : result.type === "deal"
          ? workspaceHref(result.workspaceId, "deal-room", { deal: result.id })
          : result.type === "file"
            ? `/api/files/${result.id}`
            : workspaceHref(
                result.workspaceId,
                result.type === "memory"
                  ? "memory"
                  : result.type === "artifact"
                    ? "artifacts"
                    : result.type === "plan"
                      ? "plans"
                      : result.type === "task"
                        ? "tasks"
                        : "search",
              );
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-[var(--line)] bg-white/35 px-4 py-3 hover:bg-white/60"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium">{result.title}</p>
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
          {result.type}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{result.detail}</p>
    </Link>
  );
}
