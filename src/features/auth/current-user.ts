import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { env } from "@/env";
import { db } from "@/infra/db";
import { authorize, type Action, type Role } from "./permissions";
import { SESSION_COOKIE, verifySession } from "./session";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/**
 * Re-read on every request, so deactivating someone or changing their role
 * takes effect at once — but cached within a single request, because the
 * layout and the page both ask, and each ask is a 600ms round trip to the
 * database.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession(token, env.jwtSecret);
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user?.isActive) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
});

export async function requireUser(action: Action = "read"): Promise<SessionUser> {
  return authorize(await getCurrentUser(), action);
}
