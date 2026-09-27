import { describe, expect, it } from "vitest";
import { buildInvoiceEmail, escapeHtml, type EmailFacts } from "./email";

const facts: EmailFacts = {
  number: "INV2609001",
  customerName: "ALSUM INFOTECH PRIVATE LIMITED",
  companyName: "FINCLUST PRIVATE LIMITED",
  total: "INR 3,38,683.60",
  issueDate: "September 1, 2026",
  dueDate: null,
  count: 1,
};

describe("escapeHtml", () => {
  it("neutralises markup", () => {
    expect(escapeHtml(`<b>&"'`)).toBe("&lt;b&gt;&amp;&quot;&#39;");
  });
});

describe("buildInvoiceEmail", () => {
  it("writes a subject naming the invoice and who it is from", () => {
    const { subject } = buildInvoiceEmail("client", facts);
    expect(subject).toBe("Invoice INV2609001 from FINCLUST PRIVATE LIMITED");
  });

  it("addresses the customer and states the amount", () => {
    const { html } = buildInvoiceEmail("client", facts);
    expect(html).toContain("ALSUM INFOTECH PRIVATE LIMITED");
    expect(html).toContain("INR 3,38,683.60");
    expect(html).toContain("INV2609001");
  });

  it("mentions the due date only when there is one", () => {
    expect(buildInvoiceEmail("client", facts).html).not.toMatch(/due/i);
    const withDue = buildInvoiceEmail("client", { ...facts, dueDate: "September 16, 2026" });
    expect(withDue.html).toContain("September 16, 2026");
  });

  it("writes a different message for the accountant", () => {
    const { subject, html } = buildInvoiceEmail("accountant", { ...facts, count: 7 });
    expect(subject).toContain("7 invoices");
    // The CA is not the customer, so the greeting must not be the customer's name.
    expect(html).not.toContain("ALSUM INFOTECH");
  });

  it("escapes a customer name that contains markup", () => {
    // Names are typed by hand and land in an HTML email body.
    const { html } = buildInvoiceEmail("client", { ...facts, customerName: '<script>alert(1)</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes the company name and the amount too", () => {
    const { html, subject } = buildInvoiceEmail("client", { ...facts, companyName: 'A & B <Ltd>' });
    expect(html).toContain("A &amp; B &lt;Ltd&gt;");
    expect(subject).toBe("Invoice INV2609001 from A & B <Ltd>"); // a subject is plain text
  });
});
