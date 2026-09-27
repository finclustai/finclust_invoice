function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// 32 bytes is the HS256 block size. A shorter secret is brute-forceable offline
// from any captured session cookie, and the payload is only {sub: userId}, so
// cracking it yields a forged ADMIN session.
const MIN_SECRET_LENGTH = 32;

/**
 * Read lazily through getters, so a bad value throws where it is used — with
 * the variable's name in the message — instead of silently becoming NaN at
 * import time and surfacing as "nobody can log in, and no error says why".
 */
export const env = {
  get jwtSecret(): string {
    const secret = required("JWT_SECRET");
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    return secret;
  },
  get sessionTtlHours(): number {
    const raw = process.env.SESSION_TTL_HOURS;
    if (raw === undefined || raw === "") return 12;
    const hours = Number(raw);
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new Error(`SESSION_TTL_HOURS must be a positive number, got ${JSON.stringify(raw)}`);
    }
    return hours;
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
};
