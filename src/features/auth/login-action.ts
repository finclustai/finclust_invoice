"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { db } from "@/infra/db";
import { verifyCredentials } from "./password";
import { SESSION_COOKIE, signSession } from "./session";

export interface LoginState {
  error?: string;
}

const MAX_FAILURES_PER_MINUTE = 5;

/** Only same-site relative paths; "//evil.com" and "/\evil.com" are open redirects. */
function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const failures = await db.activityLog.count({
    where: { action: "login_failed", entityId: email, at: { gte: new Date(Date.now() - 60_000) } },
  });
  if (failures >= MAX_FAILURES_PER_MINUTE) return { error: "Too many attempts. Wait a minute and try again." };

  const user = await verifyCredentials((e) => db.user.findUnique({ where: { email: e } }), email, password);
  if (!user) {
    await db.activityLog.create({ data: { action: "login_failed", entity: "user", entityId: email } });
    return { error: "Email or password is incorrect." };
  }

  const token = await signSession({ userId: user.id }, env.jwtSecret, env.sessionTtlHours);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: env.sessionTtlHours * 3600,
  });
  await db.activityLog.create({
    data: { actorId: user.id, action: "login", entity: "user", entityId: user.id },
  });
  redirect(safeNext(String(form.get("next") ?? "/")));
}
