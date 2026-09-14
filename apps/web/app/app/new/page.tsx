import Link from "next/link";
import { WorkspaceCreateForm } from "@/components/workspace-create-form";
import { bootstrapAccount } from "@/lib/product";

export const dynamic = "force-dynamic";

export default async function NewWorkspacePage() {
  await bootstrapAccount();
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <div className="w-full max-w-2xl">
        <Link href="/app" className="text-xs text-[var(--muted)]">
          ← Back to Zeus
        </Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
          New workspace
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          Start a fresh project room.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--muted)]">
          The new workspace gets its own objective, team, conversations, tasks, files, memory and
          activity. State never leaks from another workspace.
        </p>
        <div className="mt-9">
          <WorkspaceCreateForm />
        </div>
      </div>
    </main>
  );
}
