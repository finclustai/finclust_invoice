"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/features/auth/login-action";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-body">Email</span>
        <input className="field" type="email" name="email" autoComplete="email" required autoFocus />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-body">Password</span>
        <input className="field" type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.error && (
        <p role="alert" className="rounded-[var(--radius-input)] bg-red-tint px-3 py-2 text-sm text-red">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
