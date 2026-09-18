import Link from "next/link";

export const metadata = {
  title: "Privacy | Zeus",
  description: "How Zeus handles account, workspace, agent, integration, and usage data.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-[var(--muted)]">← Zeus</Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-[-0.04em]">Privacy</h1>
      <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
        Zeus stores the information required to operate your account and workspaces, including
        workspace content, agent runs, task and plan state, audit events, integration metadata and
        usage telemetry. Credentials are referenced server-side and must not be exposed to agents,
        logs, client bundles or public artifacts.
      </p>
      <div className="mt-10 space-y-8 text-sm leading-7">
        <section><h2 className="text-lg font-semibold">Data isolation</h2><p className="mt-2 text-[var(--muted)]">Workspace data is tenant-scoped. Database access is protected by application authorization and row-level security. Zeus fails closed in hosted environments when production authentication or database configuration is unavailable.</p></section>
        <section><h2 className="text-lg font-semibold">Connected services</h2><p className="mt-2 text-[var(--muted)]">When you connect an external service, Zeus stores only the connection metadata and credential reference needed to use the permissions you granted. External providers process requests under their own terms and privacy notices.</p></section>
        <section><h2 className="text-lg font-semibold">AI processing</h2><p className="mt-2 text-[var(--muted)]">Prompts and the minimum context required for an agent run may be sent to the configured AI routing provider. Provider and model routing are operational implementation details and are not exposed as customer-facing guarantees.</p></section>
        <section><h2 className="text-lg font-semibold">Retention and control</h2><p className="mt-2 text-[var(--muted)]">Workspace owners can remove workspace content and revoke integrations through the product controls. Operational and security records may be retained where necessary for integrity, abuse prevention, legal obligations or dispute handling.</p></section>
        <section><h2 className="text-lg font-semibold">Controller information</h2><p className="mt-2 text-[var(--muted)]">The final legal controller name, postal address and privacy contact are deployment-specific and must be configured before a public commercial launch. Zeus does not fabricate legal-entity details.</p></section>
      </div>
      <div className="mt-12 flex gap-4 text-sm"><Link href="/terms" className="underline">Terms</Link><Link href="/data-controls" className="underline">Data controls</Link></div>
    </main>
  );
}
