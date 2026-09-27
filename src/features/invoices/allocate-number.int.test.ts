import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { allocateInvoiceNumber } from "./allocate-number";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("allocateInvoiceNumber (needs TEST_DATABASE_URL)", () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const PERIOD = "9901"; // January 2099: never collides with real data

  afterAll(async () => {
    await prisma.invoiceCounter.deleteMany({ where: { period: PERIOD } });
    await prisma.$disconnect();
  });

  it("gives 10 concurrent callers 10 distinct consecutive numbers", async () => {
    await prisma.invoiceCounter.deleteMany({ where: { period: PERIOD } });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        prisma.$transaction((tx) => allocateInvoiceNumber(tx, "2099-01-15")),
      ),
    );
    const numbers = results.map((r) => r.number).sort();
    expect(numbers).toEqual(
      Array.from({ length: 10 }, (_, i) => `INV9901${String(i + 1).padStart(3, "0")}`),
    );
  });

  it("starts a new month at 001", async () => {
    await prisma.invoiceCounter.deleteMany({ where: { period: PERIOD } });
    const first = await prisma.$transaction((tx) => allocateInvoiceNumber(tx, "2099-01-01"));
    expect(first).toEqual({ period: PERIOD, number: "INV9901001" });
  });
});
