import Link from "next/link";

export const metadata = {
  title: "Data Controls | Zeus",
  description: "Account, workspace, integration and audit data controls in Zeus.",
};

export default function DataControlsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-[var(--muted)]">← Zeus</Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-[-0.04em]">Data controls</h1>
      <p className="mt-4 text-sm leading-7 text-[var(--muted)]">Zeus separates reversible workspace controls from destructive account-level actions. Destructive actions require explicit confirmation and must not be triggered by an agent without the user's authority.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-[var(--line)] bg-white/45 p-5"><h2 className="font-semibold">Workspace data</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Workspace owners can archive workspaces and remove individual connections, API tokens and workspace content from the authenticated Settings surface.</p></section>
        <section className="rounded-2xl border border-[var(--line)] bg-white/45 p-5"><h2 className="font-semibold">Connections</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Revoking or deleting a Zeus connection stops Zeus from using that stored connection reference. You may also need to revoke the credential at the external provider.</p></section>
        <section className="rounded-2xl border border-[var(--line)] bg-white/45 p-5"><h2 className="font-semibold">Audit evidence</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Security and execution evidence is intentionally distinct from mutable workspace content so agents cannot rewrite history to make a failed action appear successful.</p></section>
        <section className="rounded-2xl border border-[var(--line)] bg-white/45 p-5"><h2 className="font-semibold">Account export / erasure</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Self-service account-wide export and erasure are not represented as complete until their authenticated destructive workflows are wired and verified. Contact details for manual privacy requests must be configured before public launch.</p></section>
      </div>
      <div className="mt-10 flex gap-4 text-sm"><Link href="/app" className="rounded-full bg-[var(--ink)] px-4 py-2 text-white">Open Zeus</Link><Link href="/privacy" className="px-4 py-2 underline">Privacy</Link></div>
    </main>
  );
}
