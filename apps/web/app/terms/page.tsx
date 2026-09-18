import Link from "next/link";

export const metadata = {
  title: "Terms | Zeus",
  description: "Core product terms and operating boundaries for Zeus.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-[var(--muted)]">
        ← Zeus
      </Link>
      <h1 className="mt-8 text-4xl font-semibold tracking-[-0.04em]">Terms</h1>
      <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
        These product terms describe the operating boundaries of the pre-billing Zeus service.
        Commercial pricing, subscription and cancellation terms are intentionally added with the
        separate Stripe launch.
      </p>
      <div className="mt-10 space-y-8 text-sm leading-7">
        <section>
          <h2 className="text-lg font-semibold">Your authority</h2>
          <p className="mt-2 text-[var(--muted)]">
            You may connect repositories, infrastructure and third-party services only when you are
            authorized to grant Zeus access. You remain responsible for the business decisions and
            approvals you give the system.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Agent execution</h2>
          <p className="mt-2 text-[var(--muted)]">
            Zeus agents operate within configured tools, connections, budgets and approval
            boundaries. Higher-risk actions may require explicit approval. A generated plan, draft
            or agent recommendation is not a guarantee of a particular business, legal or financial
            outcome.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Acceptable use</h2>
          <p className="mt-2 text-[var(--muted)]">
            Do not use Zeus to access systems without permission, evade security controls, violate
            law, infringe third-party rights, or conceal unauthorized automated activity.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Availability and verification</h2>
          <p className="mt-2 text-[var(--muted)]">
            Automation can fail because of provider outages, revoked credentials, external API
            changes or insufficient permissions. Zeus records execution evidence and should stop
            rather than claim success when required verification fails.
          </p>
        </section>
        <section>
          <h2 className="text-lg font-semibold">Legal operator</h2>
          <p className="mt-2 text-[var(--muted)]">
            The contracting entity, address, governing-law wording and required consumer disclosures
            must be supplied from the actual deployment owner before commercial launch. No
            placeholder is presented as a real legal identity.
          </p>
        </section>
      </div>
      <div className="mt-12 flex gap-4 text-sm">
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
        <Link href="/data-controls" className="underline">
          Data controls
        </Link>
      </div>
    </main>
  );
}
