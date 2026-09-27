import { describe, expect, it } from "vitest";
import type { InvoiceDraft } from "@/domain/invoice/schema";
import { buildDocumentProps, type CompanyForPdf } from "./props";

const finclust: CompanyForPdf = {
  name: "FINCLUST PRIVATE LIMITED",
  addressLines: ["13117, Floor-11, Wing-13, Sobha Dream Acres, Phase-1", "Bangalore - 560087, Karnataka"],
  email: "hr@finclust.ai",
  phone: null,
  gstin: "29AAGCF2643D1ZS",
  stateCode: "29",
  lut: "AD290625019128X",
  bankName: "IndusInd Bank Limited",
  bankAccount: "257353000123",
  bankIfsc: "INDB0001454",
  bankBranch: "Kundalahalli Branch",
};

const line = (description: string, rupees: number, hsnSac: string | null = null) => ({
  id: description,
  description,
  hsnSac,
  qty: 1,
  rateMinor: rupees * 100,
});

const alsum: InvoiceDraft = {
  companyId: "c",
  customerId: null,
  customer: {
    name: "ALSUM INFOTECH PRIVATE LIMITED",
    addressLines: ["25/12, Alagiri Street, MGR Nagar", "Chennai - 600078, Tamil Nadu"],
    gstin: "33AAGCA7303P1ZK",
    stateCode: "33",
    emails: ["hr@alsuminfotech.com"],
  },
  issueDate: "2026-08-01",
  dueDate: null,
  paymentTerms: null,
  currency: "INR",
  gstEnabled: true,
  taxRateBp: 1800,
  template: "classic",
  notes: null,
  lines: [
    line("Ramreddy Caratlane project", 37500),
    line("Srinivas Caratlane project", 25000),
    line("Srinivas Caratlane project (August)", 70000),
    line("Ramreddy Caratlane project (August)", 75000),
    line("Anil Singh - OTBI", 41130),
    line("Vamshi - OIC", 38390),
  ],
};

const technophile: InvoiceDraft = {
  ...alsum,
  customer: {
    name: "Technophile LLC",
    addressLines: ["300, Colonial Center Pkwy, Suite 100", "Roswell, GA 30076, USA"],
    gstin: null,
    stateCode: null,
    emails: ["ap@technophilellc.com"],
  },
  currency: "USD",
  gstEnabled: false,
  lines: [line("EPM planning Demo", 211), line("Mulesoft training", 315), line("Cook Medical", 800)],
};

describe("buildDocumentProps: INV2608002, the real INR invoice", () => {
  const doc = buildDocumentProps(alsum, finclust, "INV2608002", "ISSUED");

  it("reproduces the balance from the Google Doc", () => {
    expect(doc.calc.subtotalMinor).toBe(28702000);
    expect(doc.calc.totalMinor).toBe(33868360);
  });
  it("charges one IGST line, because Tamil Nadu is not Karnataka", () => {
    expect(doc.calc.taxes).toEqual([{ label: "IGST", rateBp: 1800, amountMinor: 5166360 }]);
  });
  it("carries the amount in words for the CA", () => {
    expect(doc.calc.totalInWords).toBe(
      "Rupees Three Lakh Thirty Eight Thousand Six Hundred Eighty Three and Sixty Paise Only",
    );
  });
  it("prints the customer's GSTIN", () => {
    expect(doc.customer.gstin).toBe("33AAGCA7303P1ZK");
  });
  it("shows no LUT declaration on a domestic invoice", () => {
    expect(doc.showLut).toBe(false);
  });
  it("hides the HSN/SAC column when no line has one", () => {
    expect(doc.showHsnColumn).toBe(false);
  });
  it("shows the HSN/SAC column as soon as any line has one", () => {
    const withHsn = { ...alsum, lines: [line("Consulting", 1000, "998314"), line("Other", 500)] };
    expect(buildDocumentProps(withHsn, finclust, "X", "DRAFT").showHsnColumn).toBe(true);
  });
  it("marks a draft so it cannot be mistaken for a sent invoice", () => {
    expect(buildDocumentProps(alsum, finclust, "X", "DRAFT").isDraft).toBe(true);
    expect(doc.isDraft).toBe(false);
  });
});

describe("buildDocumentProps: INV2608001, the export invoice", () => {
  const doc = buildDocumentProps(technophile, finclust, "INV2608001", "ISSUED");

  it("totals $1,326.00 with no tax", () => {
    expect(doc.calc.totalMinor).toBe(132600);
    expect(doc.calc.taxes).toEqual([]);
  });
  it("declares the supply under LUT, with the number", () => {
    expect(doc.showLut).toBe(true);
    expect(doc.seller.lut).toBe("AD290625019128X");
  });
  it("omits the bill-to GSTIN line for an overseas customer", () => {
    expect(doc.customer.gstin).toBeNull();
  });
});

describe("dates and optional fields", () => {
  it("formats the invoice date the way the sample prints it", () => {
    expect(buildDocumentProps(alsum, finclust, "X", "ISSUED").issueDateLabel).toBe("August 1, 2026");
  });
  it("omits the due date when there is none", () => {
    expect(buildDocumentProps(alsum, finclust, "X", "ISSUED").dueDateLabel).toBeNull();
  });
  it("formats the due date when set", () => {
    const withDue = { ...alsum, dueDate: "2026-08-16" };
    expect(buildDocumentProps(withDue, finclust, "X", "ISSUED").dueDateLabel).toBe("August 16, 2026");
  });
});
