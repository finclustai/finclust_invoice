"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { db } from "@/infra/db";
import { verifyCredentials } from "./password";
import { safeNext } from "./safe-next";
import { SESSION_COOKIE, signSession } from "./session";

export interface LoginState {
  error?: string;
}

// Keyed on the caller's address, never on the email. An email-keyed limit lets
// anyone who knows admin@finclust.ai lock the real admin out for as long as
// they keep guessing, and with three users that is a full outage.
const MAX_FAILURES_PER_IP = 10;
const WINDOW_MS = 60_000;

async function callerIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const ip = await callerIp();
  const failures = await db.activityLog.count({
    where: { action: "login_failed", entityId: ip, at: { gte: new Date(Date.now() - WINDOW_MS) } },
  });
  // Returning before the insert also bounds how fast an unauthenticated caller
  // can grow activity_log.
  if (failures >= MAX_FAILURES_PER_IP) return { error: "Too many attempts. Wait a minute and try again." };

  const user = await verifyCredentials((e) => db.user.findUnique({ where: { email: e } }), email, password);
  if (!user) {
    await db.activityLog.create({
      data: { action: "login_failed", entity: "ip", entityId: ip, meta: { email } },
    });
    return { error: "Email or password is incorrect." };
  }

  const token = await signSession({ userId: user.id }, env.jwtSecret, env.sessionTtlHours);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: Math.round(env.sessionTtlHours * 3600),
  });
  await db.activityLog.create({
    data: { actorId: user.id, action: "login", entity: "user", entityId: user.id, meta: { ip } },
  });
  redirect(safeNext(String(form.get("next") ?? "/")));
}
