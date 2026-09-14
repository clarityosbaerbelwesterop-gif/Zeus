"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "./actions";

export default function SignInPage() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-[410px]">
        <Link href="/" className="text-sm font-semibold">
          ZEUS
        </Link>
        <h1 className="mt-14 text-4xl font-semibold tracking-[-0.04em]">Welcome back.</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">Sign in to your workspaces and AI team.</p>
        <form action={action} className="mt-10 space-y-4">
          <label className="block text-sm">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3 outline-none focus:border-neutral-500"
            />
          </label>
          <label className="block text-sm">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              className="mt-2 w-full rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3 outline-none focus:border-neutral-500"
            />
          </label>
          {state?.error ? (
            <p role="alert" className="text-sm text-red-700">
              {state.error}
            </p>
          ) : null}
          <button
            disabled={pending}
            className="w-full rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-sm text-[var(--muted)]">
          New to Zeus?{" "}
          <Link className="text-[var(--ink)] underline" href="/auth/sign-up">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
