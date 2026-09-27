/**
 * Copies everything from one database to another.
 *
 * Written for moving the project to a nearer region, where the only way is to
 * create a new one and carry the data across, but it works as a plain backup
 * and restore too.
 *
 *   pnpm db:export                 -> writes tmp/database-export.json
 *   pnpm db:import                 -> loads it into whatever DATABASE_URL says
 *
 * Import order follows the foreign keys: a company before the invoices that
 * bill from it, an invoice before its lines. It refuses to run against a
 * database that already holds invoices, so a mistyped connection string
 * cannot quietly merge two sets of books.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const FILE = "tmp/database-export.json";
const prisma = new PrismaClient();

/** BigInt does not survive JSON, and every money column is one. */
const replacer = (_key: string, value: unknown) =>
  typeof value === "bigint" ? { __bigint: value.toString() } : value;

const reviver = (_key: string, value: unknown) =>
  value && typeof value === "object" && "__bigint" in (value as Record<string, unknown>)
    ? BigInt((value as { __bigint: string }).__bigint)
    : value;

async function exportAll() {
  const data = {
    exportedAt: new Date().toISOString(),
    users: await prisma.user.findMany(),
    companies: await prisma.company.findMany(),
    customers: await prisma.customer.findMany(),
    catalogItems: await prisma.catalogItem.findMany(),
    settings: await prisma.setting.findMany(),
    invoiceCounters: await prisma.invoiceCounter.findMany(),
    invoices: await prisma.invoice.findMany(),
    invoiceLines: await prisma.invoiceLine.findMany(),
    invoiceVersions: await prisma.invoiceVersion.findMany(),
    payments: await prisma.payment.findMany(),
    pdfArchive: await prisma.pdfArchive.findMany(),
    shareTokens: await prisma.shareToken.findMany(),
    activityLog: await prisma.activityLog.findMany(),
  };

  mkdirSync("tmp", { recursive: true });
  writeFileSync(FILE, JSON.stringify(data, replacer, 2));

  console.log(`Wrote ${FILE}`);
  for (const [name, rows] of Object.entries(data)) {
    if (Array.isArray(rows)) console.log(`  ${(name + "                ").slice(0, 17)} ${rows.length}`);
  }
  console.log(`\nHost: ${new URL(process.env.DATABASE_URL!).hostname}`);
}

async function importAll() {
  const data = JSON.parse(readFileSync(FILE, "utf8"), reviver);
  const host = new URL(process.env.DATABASE_URL!).hostname;

  const existing = await prisma.invoice.count();
  if (existing > 0) {
    console.error(`Refusing to import: ${host} already holds ${existing} invoices.`);
    console.error("Point DATABASE_URL at the new, empty database, or clear that one first.");
    process.exitCode = 1;
    return;
  }

  console.log(`Importing into ${host}, from an export taken ${data.exportedAt}`);

  // Parents before children, so no insert lands before the row it points at.
  const steps: [string, () => Promise<{ count: number }>][] = [
    ["users", () => prisma.user.createMany({ data: data.users, skipDuplicates: true })],
    ["companies", () => prisma.company.createMany({ data: data.companies, skipDuplicates: true })],
    ["customers", () => prisma.customer.createMany({ data: data.customers, skipDuplicates: true })],
    ["catalogItems", () => prisma.catalogItem.createMany({ data: data.catalogItems, skipDuplicates: true })],
    ["settings", () => prisma.setting.createMany({ data: data.settings, skipDuplicates: true })],
    ["invoiceCounters", () => prisma.invoiceCounter.createMany({ data: data.invoiceCounters, skipDuplicates: true })],
    ["invoices", () => prisma.invoice.createMany({ data: data.invoices, skipDuplicates: true })],
    ["invoiceLines", () => prisma.invoiceLine.createMany({ data: data.invoiceLines, skipDuplicates: true })],
    ["invoiceVersions", () => prisma.invoiceVersion.createMany({ data: data.invoiceVersions, skipDuplicates: true })],
    ["payments", () => prisma.payment.createMany({ data: data.payments, skipDuplicates: true })],
    ["pdfArchive", () => prisma.pdfArchive.createMany({ data: data.pdfArchive, skipDuplicates: true })],
    ["shareTokens", () => prisma.shareToken.createMany({ data: data.shareTokens, skipDuplicates: true })],
    // Left last and allowed to fail: the audit trail is worth keeping but not
    // worth failing a migration over.
    ["activityLog", () => prisma.activityLog.createMany({ data: data.activityLog, skipDuplicates: true })],
  ];

  for (const [name, run] of steps) {
    try {
      const { count } = await run();
      console.log(`  ${(name + "                ").slice(0, 17)} ${count}`);
    } catch (error) {
      console.error(`  ${name}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
      if (name !== "activityLog") throw error;
    }
  }

  console.log("\nDone. Check the app, then point Vercel at the new database.");
}

const mode = process.argv[2];
(mode === "import" ? importAll() : exportAll()).finally(() => prisma.$disconnect());
