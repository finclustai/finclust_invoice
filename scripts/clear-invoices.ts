/**
 * Removes every invoice and everything hanging off one, keeping the companies,
 * customers, catalog and logins.
 *
 * Deliberately not reachable from the app: wiping the ledger is not a button
 * anyone should have. Run it deliberately: pnpm db:clear
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const before = await prisma.invoice.count();
  if (before === 0) {
    console.log("Nothing to clear.");
    return;
  }

  // Order matters: children first, then the counters that numbered them.
  const [links, archives, payments, versions, lines, invoices, counters] = await prisma.$transaction([
    prisma.shareToken.deleteMany(),
    prisma.pdfArchive.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoiceVersion.deleteMany(),
    prisma.invoiceLine.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.invoiceCounter.deleteMany(),
    prisma.activityLog.deleteMany({ where: { entity: { in: ["invoice", "period"] } } }),
  ]);

  console.log(`Cleared ${invoices.count} invoices.`);
  console.log(`  lines ${lines.count} · versions ${versions.count} · payments ${payments.count}`);
  console.log(`  share links ${links.count} · archived PDFs ${archives.count} · counters ${counters.count}`);
  console.log("Kept:");
  console.log(`  companies ${await prisma.company.count()} · customers ${await prisma.customer.count()} · users ${await prisma.user.count()}`);
  console.log("Numbering restarts at 001 for the next month you issue in.");
}

main().finally(() => prisma.$disconnect());
