import { AGENT_TEMPLATES } from "@zeus/agents";
import Link from "next/link";
import { AgentMark } from "@/components/agent-mark";

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[var(--paper)]">
      <nav className="mx-auto flex max-w-[1380px] items-center justify-between px-6 py-6 md:px-10">
        <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-xl border border-[var(--line)] bg-white/60">Z</span>
          ZEUS
        </Link>
        <div className="desktop-only flex items-center gap-8 text-sm text-[var(--muted)]">
          <a href="#team">Team</a><a href="#workspace">Workspace</a><a href="#principles">Principles</a>
        </div>
        <Link href="/auth/sign-in" className="rounded-full bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-85">Start with Zeus</Link>
      </nav>

      <section className="relative mx-auto max-w-[1380px] px-6 pb-24 pt-20 text-center md:px-10 md:pt-32">
        <div className="zeus-grid pointer-events-none absolute inset-x-0 top-0 -z-0 h-[620px] opacity-50" />
        <div className="relative z-10 mx-auto max-w-5xl">
          <p className="mb-6 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">A small AI company inside one calm workspace</p>
          <h1 className="text-balance text-6xl font-semibold leading-[0.92] tracking-[-0.055em] md:text-[110px]">Your AI team.<br />Ready to work.</h1>
          <p className="mx-auto mt-8 max-w-2xl text-pretty text-lg leading-8 text-[var(--muted)] md:text-xl">Give real work to specialized AI teammates that plan, build, design, test and sell alongside you — with visible activity, artifacts and verification.</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link href="/auth/sign-up" className="rounded-full bg-[var(--ink)] px-6 py-3 text-sm font-semibold text-white">Create workspace</Link>
            <a href="#workspace" className="rounded-full border border-[var(--line)] bg-white/45 px-6 py-3 text-sm font-semibold">See how it works</a>
          </div>
        </div>
      </section>

      <section id="workspace" className="mx-auto max-w-[1240px] px-4 pb-28 md:px-8">
        <div className="soft-panel overflow-hidden rounded-[28px] bg-[#efebe3]">
          <div className="grid min-h-[560px] grid-cols-[250px_1fr] md:grid-cols-[270px_1fr_300px]">
            <aside className="border-r border-[var(--line)] p-5 text-left">
              <div className="mb-8 flex items-center justify-between"><b>Launch Zeus</b><span className="text-[var(--muted)]">⌘K</span></div>
              <p className="mb-3 text-xs uppercase tracking-widest text-[var(--muted)]">Teammates</p>
              <div className="space-y-2">{AGENT_TEMPLATES.map((agent) => <div key={agent.code} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-white/50"><AgentMark agent={agent} size={34} /><div><div className="text-sm font-medium">{agent.name}</div><div className="text-xs text-[var(--muted)]">{agent.role.split("/")[0]}</div></div></div>)}</div>
            </aside>
            <div className="flex flex-col p-6 text-left md:p-9">
              <div className="mb-auto"><p className="text-sm text-[var(--muted)]">Jorge · Team lead</p><h2 className="mt-3 max-w-xl text-4xl font-semibold tracking-[-0.035em]">What should the team move forward today?</h2></div>
              <div className="rounded-[22px] border border-[var(--line)] bg-white/70 p-4 shadow-sm"><p className="text-sm text-[var(--muted)]">Launch the new workspace experience. Kai handles implementation, Lora checks UX, Simon verifies it.</p><div className="mt-7 flex justify-between text-xs text-[var(--muted)]"><span>Jorge + Kai + Lora + Simon</span><span className="grid size-8 place-items-center rounded-full bg-[var(--ink)] text-white">↑</span></div></div>
            </div>
            <aside className="hidden border-l border-[var(--line)] p-6 text-left md:block"><p className="text-xs uppercase tracking-widest text-[var(--muted)]">Live activity</p><ol className="mt-6 space-y-6 text-sm"><li><b>Jorge</b><p className="mt-1 text-[var(--muted)]">Split launch into 4 owned tasks</p></li><li><b>Kai</b><p className="mt-1 text-[var(--muted)]">Inspecting repository structure</p></li><li><b>Simon</b><p className="mt-1 text-[var(--muted)]">Verification queued after build</p></li></ol></aside>
          </div>
        </div>
      </section>

      <section id="team" className="mx-auto max-w-[1240px] px-6 pb-28 md:px-8"><div className="mb-12 max-w-2xl"><p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Meet the team</p><h2 className="mt-4 text-5xl font-semibold tracking-[-0.045em]">Five specialists. One workspace.</h2></div><div className="grid gap-px overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--line)] md:grid-cols-5">{AGENT_TEMPLATES.map((agent) => <article key={agent.code} className="min-h-64 bg-[var(--paper)] p-6"><AgentMark agent={agent} size={50} /><h3 className="mt-8 text-xl font-semibold">{agent.name}</h3><p className="mt-1 text-sm text-[var(--muted)]">{agent.role}</p><p className="mt-6 text-sm leading-6 text-[var(--muted)]">{agent.purpose}</p></article>)}</div></section>

      <section id="principles" className="border-t border-[var(--line)]"><div className="mx-auto grid max-w-[1240px] gap-12 px-6 py-20 md:grid-cols-3 md:px-8"><div><b>Real work, not a chat demo.</b><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Workspaces, runs and artifacts are durable product state.</p></div><div><b>Visible without surveillance.</b><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Zeus shows operational steps and evidence, never private chain-of-thought.</p></div><div><b>Safe by foundation.</b><p className="mt-3 text-sm leading-6 text-[var(--muted)]">Server-verified identity, tenant RLS and scoped connections come before autonomy.</p></div></div></section>
    </main>
  );
}
