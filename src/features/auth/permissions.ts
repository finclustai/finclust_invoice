export type Role = "ADMIN" | "ACCOUNTANT" | "VIEWER";
export type Action = "read" | "write" | "send" | "admin";

const ALLOWED: Record<Role, readonly Action[]> = {
  ADMIN: ["read", "write", "send", "admin"],
  ACCOUNTANT: ["read", "write", "send"],
  VIEWER: ["read"],
};

export function can(role: Role, action: Action): boolean {
  return ALLOWED[role].includes(action);
}

export class AuthError extends Error {
  constructor(readonly reason: "unauthenticated" | "forbidden") {
    super(reason);
    this.name = "AuthError";
  }
}

/** Every server action calls this, so middleware is never the only gate. */
export function authorize<U extends { role: Role }>(user: U | null, action: Action): U {
  if (!user) throw new AuthError("unauthenticated");
  if (!can(user.role, action)) throw new AuthError("forbidden");
  return user;
}
