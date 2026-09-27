function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  get jwtSecret() {
    return required("JWT_SECRET");
  },
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  isProduction: process.env.NODE_ENV === "production",
};
