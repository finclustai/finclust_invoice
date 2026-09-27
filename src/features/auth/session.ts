import { jwtVerify, SignJWT } from "jose";

// Edge-safe (jose only) so middleware can import it.
export const SESSION_COOKIE = "invoice_session";

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(
  session: { userId: string },
  secret: string,
  ttlHours: number,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + Math.round(ttlHours * 3600))
    .sign(key(secret));
}

export async function verifySession(token: string, secret: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    return payload.sub ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}
