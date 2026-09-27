import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Node 22's built-in .env loader, so integration tests see TEST_DATABASE_URL
// without adding dotenv or a wrapper script.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // The integration tests talk to Supabase over the network, and several make
    // a handful of sequential round trips. The default 5s trips on latency
    // rather than on anything being wrong.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
