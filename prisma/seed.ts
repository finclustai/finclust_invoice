import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateInvoice } from "../src/domain/invoice/calculate";
import type { InvoiceSnapshot } from "../src/domain/invoice/schema";

const prisma = new PrismaClient();

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main() {
  const email = required("SEED_ADMIN_EMAIL").toLowerCase();
  const admin = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Admin",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(required("SEED_ADMIN_PASSWORD"), 10),
    },
    update: {},
  });

  if (await prisma.company.count()) {
    console.log("Already seeded; admin ensured.");
    return;
  }

  const company = await prisma.company.create({
    data: {
      name: "FINCLUST PRIVATE LIMITED",
      addressLines: [
        "13117, Floor-11, Wing-13, Sobha Dream Acres, Phase-1",
        "Bangalore - 560087, Karnataka",
      ],
      email: "hr@finclust.ai",
      gstin: "29AAGCF2643D1ZS",
      stateCode: "29",
      lut: "AD290625019128X",
      bankName: "IndusInd Bank Limited",
      bankAccount: "257353000123",
      bankIfsc: "INDB0001454",
      bankBranch: "Kundalahalli Branch",
    },
  });

  const technophile = await prisma.customer.create({
    data: {
      name: "Technophile LLC",
      addressLines: ["300, Colonial Center Pkwy, Suite 100", "Roswell, GA 30076, USA"],
      emails: ["ap@technophilellc.com"],
      stateCode: null,
      currency: "USD",
    },
  });
  const alsum = await prisma.customer.create({
    data: {
      name: "ALSUM INFOTECH PRIVATE LIMITED",
      addressLines: ["25/12, Alagiri Street, MGR Nagar", "Chennai - 600078, Tamil Nadu"],
      gstin: "33AAGCA7303P1ZK",
      stateCode: "33",
      emails: ["hr@alsuminfotech.com"],
      currency: "INR",
    },
  });

  const invoices: InvoiceSnapshot[] = [
    {
      number: "INV2608001",
      companyName: company.name,
      companyId: company.id,
      customerId: technophile.id,
      customer: {
        name: technophile.name,
        addressLines: technophile.addressLines,
        gstin: null,
        stateCode: null,
        emails: technophile.emails,
      },
      issueDate: "2026-08-01",
      dueDate: null,
      paymentTerms: null,
      currency: "USD",
      gstEnabled: false,
      taxRateBp: 1800,
      template: "classic",
      notes: null,
      lines: (
        [
          ["EPM planning Demo", 21100],
          ["Mulesoft training (50% paid on Aug-7)", 31500],
          ["Cook Medical (other)", 80000],
        ] as const
      ).map(([description, rateMinor]) => ({
        id: randomUUID(),
        description,
        hsnSac: null,
        qty: 1,
        rateMinor,
      })),
    },
    {
      number: "INV2608002",
      companyName: company.name,
      companyId: company.id,
      customerId: alsum.id,
      customer: {
        name: alsum.name,
        addressLines: alsum.addressLines,
        gstin: alsum.gstin,
        stateCode: "33",
        emails: alsum.emails,
      },
      issueDate: "2026-08-01",
      dueDate: null,
      paymentTerms: null,
      currency: "INR",
      gstEnabled: true,
      taxRateBp: 1800,
      template: "classic",
      notes: null,
      lines: (
        [
          ["Ramreddy Caratlane project (Paid on Aug-7, for 15 days of July - OTBI)", 3750000],
          ["Srinivas Caratlane project (Paid on Aug-7, for 15 days of July - Apex)", 2500000],
          ["Srinivas Caratlane project (August pay - Apex)", 7000000],
          ["Ramreddy Caratlane project (August pay - OTBI)", 7500000],
          ["Anil Singh - OTBI (August pay)", 4113000],
          ["Vamshi - OIC (August pay)", 3839000],
        ] as const
      ).map(([description, rateMinor]) => ({
        id: randomUUID(),
        description,
        hsnSac: null,
        qty: 1,
        rateMinor,
      })),
    },
  ];

  for (const snap of invoices) {
    const calc = calculateInvoice(snap.lines, {
      currency: snap.currency,
      gstEnabled: snap.gstEnabled,
      taxRateBp: snap.taxRateBp,
      sellerStateCode: company.stateCode,
      placeOfSupplyStateCode: snap.customer.stateCode,
    });
    await prisma.invoice.create({
      data: {
        number: snap.number,
        period: "2608",
        companyId: company.id,
        customerId: snap.customerId,
        customerSnapshot: snap.customer,
        issueDate: new Date(snap.issueDate),
        currency: snap.currency,
        gstEnabled: snap.gstEnabled,
        taxRateBp: snap.taxRateBp,
        state: "ISSUED",
        subtotalMinor: calc.subtotalMinor,
        taxMinor: calc.taxMinor,
        totalMinor: calc.totalMinor,
        createdById: admin.id,
        lines: {
          create: calc.lines.map((l, position) => ({
            id: l.id,
            position,
            description: l.description,
            hsnSac: l.hsnSac,
            qtyMilli: Math.round(l.qty * 1000),
            rateMinor: l.rateMinor,
            amountMinor: l.amountMinor,
          })),
        },
        versions: {
          create: { version: 1, snapshot: snap, reason: "Imported from Google Docs", userId: admin.id },
        },
      },
    });
  }
  await prisma.invoiceCounter.create({ data: { period: "2608", last: 2 } });
  console.log("Seeded FINCLUST, 2 customers, 2 invoices.");
}

main().finally(() => prisma.$disconnect());
