import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";

// Ported from E:\sudheer\packages\db\src\index.ts. P1001 ("can't reach database
// server") means the query never left the client, so a blind retry cannot
// duplicate a write. P1017 (closed mid-flight) is deliberately not retried.
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [150, 500];

function isRetryable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P1001";
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return (
      error.errorCode === "P1001" || error.message.toLowerCase().includes("can't reach database server")
    );
  }
  return false;
}

function createClient() {
  return new PrismaClient({ log: ["warn", "error"] }).$extends({
    query: {
      async $allOperations({ args, query }) {
        for (let attempt = 1; ; attempt++) {
          try {
            return await query(args);
          } catch (error) {
            if (!isRetryable(error) || attempt === MAX_ATTEMPTS) throw error;
            await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
          }
        }
      },
    },
  });
}

type Db = ReturnType<typeof createClient>;

// Serverless reuses the module between invocations; one client per instance.
const globalForDb = globalThis as unknown as { db?: Db };
export const db = globalForDb.db ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
