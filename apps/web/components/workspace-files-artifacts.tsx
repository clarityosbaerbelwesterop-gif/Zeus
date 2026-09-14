import { createArtifactAction, uploadFileAction } from "@/app/app/actions";
import type { WorkspacePageData } from "@/lib/product";
import { EmptyState, SectionHeader, timeLabel } from "./workspace-ui";

export function FilesView({ data, canWrite }: { data: WorkspacePageData; canWrite: boolean }) {
  const workspace = data.activeWorkspace;
  if (!workspace) return null;

  return (
    <div className="mx-auto max-w-5xl">
      <SectionHeader
        eyebrow="Files"
        title="Project source material"
        detail="Uploads are workspace-isolated, checksum-addressed and never executed. M2 uses a bounded storage abstraction rather than exposing filesystem paths."
      />
      {canWrite ? (
        <form
          id="upload-file"
          action={uploadFileAction}
          className="mb-6 flex flex-col gap-3 rounded-[22px] border border-dashed border-[var(--line)] bg-white/30 p-5 sm:flex-row sm:items-center"
        >
          <input type="hidden" name="workspaceId" value={workspace.id} />
          <input required type="file" name="file" className="min-w-0 flex-1 text-sm" />
          <button className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm text-white">Upload</button>
          <span className="text-xs text-[var(--muted)]">Max 1 MiB in M2 · executable binaries blocked</span>
        </form>
      ) : null}

      <div className="space-y-2">
        {data.files.map((file) => (
          <div
            key={file.id}
            className="grid gap-2 rounded-2xl border border-[var(--line)] bg-white/35 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{file.filename}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {file.contentType} · {file.size.toLocaleString()} bytes · SHA-256 {file.checksum.slice(0, 12)}…
              </p>
            </div>
            <a href={`/api/files/${file.id}`} className="text-xs font-medium underline underline-offset-4">
              Download
            </a>
          </div>
        ))}
        {!data.files.length ? (
          <EmptyState title="No files yet" detail="Upload project material for your team." />
        ) : null}
      </div>
    </div>
  );
}

export function ArtifactsView({ data, canWrite }: { data: WorkspacePageData; canWrite: boolean }) {
  const workspace = data.activeWorkspace;
  if (!workspace) return null;
  const artifactTypes = [
    "document",
    "code",
    "report",
    "image",
    "dataset",
    "spreadsheet",
    "presentation",
    "link",
    "other",
  ] as const;

  return (
    <div className="mx-auto max-w-5xl">
      <SectionHeader
        eyebrow="Artifacts"
        title="Outputs with provenance"
        detail="Artifacts are outputs, not source files. They can point back to the task, conversation and run that produced them."
      />
      {canWrite ? (
        <details className="mb-6 rounded-2xl border border-[var(--line)] bg-white/30 p-4">
          <summary className="cursor-pointer text-sm font-medium">Register an artifact</summary>
          <form action={createArtifactAction} className="mt-4 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="workspaceId" value={workspace.id} />
            <input
              required
              name="title"
              maxLength={240}
              placeholder="Security review"
              className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
            />
            <select
              name="type"
              className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
            >
              {artifactTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              name="mimeType"
              maxLength={200}
              placeholder="application/pdf"
              className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
            />
            <input
              name="storageKey"
              maxLength={1000}
              placeholder="Storage/link reference (optional)"
              className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm"
            />
            <select
              name="taskId"
              defaultValue=""
              className="rounded-xl border border-[var(--line)] bg-white/60 px-3 py-2 text-sm sm:col-span-2"
            >
              <option value="">No task link</option>
              {data.tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
            <button className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm text-white sm:col-span-2 sm:w-fit">
              Create artifact
            </button>
          </form>
        </details>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {data.artifacts.map((artifact) => (
          <article key={artifact.id} className="rounded-[20px] border border-[var(--line)] bg-white/40 p-4">
            <p className="text-sm font-semibold">{artifact.title}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {artifact.creatingAgent ?? "User"} · {artifact.kind}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {artifact.mimeType ?? artifact.contentType ?? "No preview type"} · {timeLabel(artifact.createdAt)}
            </p>
            {artifact.runId ? (
              <p className="mt-3 text-[11px] text-[var(--muted)]">Run {artifact.runId.slice(0, 8)}…</p>
            ) : null}
            {artifact.taskId ? (
              <p className="mt-1 text-[11px] text-[var(--muted)]">Task {artifact.taskId.slice(0, 8)}…</p>
            ) : null}
            {artifact.storageKey ? (
              <p className="mt-3 break-all text-[11px] text-[var(--muted)]">{artifact.storageKey}</p>
            ) : null}
          </article>
        ))}
        {!data.artifacts.length ? (
          <EmptyState title="No artifacts yet" detail="Outputs created by your agents will appear here." />
        ) : null}
      </div>
    </div>
  );
}
