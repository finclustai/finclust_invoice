import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATES,
  PLACEHOLDERS,
  escapeHtml,
  fillTemplate,
  type TemplateValues,
} from "./email";

const values: TemplateValues = {
  invoice_number: "INV2609001",
  customer: "ALSUM INFOTECH PRIVATE LIMITED",
  company: "FINCLUST PRIVATE LIMITED",
  total: "INR 3,38,683.60",
  invoice_date: "September 1, 2026",
  due_date: "",
  month: "September 2026",
  count: "1",
};

describe("escapeHtml", () => {
  it("neutralises markup", () => {
    expect(escapeHtml(`<b>&"'`)).toBe("&lt;b&gt;&amp;&quot;&#39;");
  });
});

describe("DEFAULT_TEMPLATES", () => {
  it("writes to the customer and to the accountant differently", () => {
    expect(DEFAULT_TEMPLATES.client.subject).not.toBe(DEFAULT_TEMPLATES.accountant.subject);
  });

  it("only uses placeholders the app actually fills", () => {
    for (const template of Object.values(DEFAULT_TEMPLATES)) {
      for (const [, name] of `${template.subject}\n${template.body}`.matchAll(/\{(\w+)\}/g)) {
        expect(PLACEHOLDERS).toContain(name);
      }
    }
  });

  it("addresses the customer by name and states the amount", () => {
    expect(DEFAULT_TEMPLATES.client.body).toContain("{customer}");
    expect(DEFAULT_TEMPLATES.client.body).toContain("{total}");
  });
});

describe("fillTemplate", () => {
  it("substitutes every placeholder", () => {
    const { subject, html } = fillTemplate(DEFAULT_TEMPLATES.client, values);
    expect(subject).toContain("INV2609001");
    expect(html).toContain("ALSUM INFOTECH PRIVATE LIMITED");
    expect(html).toContain("INR 3,38,683.60");
    expect(html).not.toMatch(/\{\w+\}/);
  });

  it("turns blank lines into paragraphs so the email is readable", () => {
    const { html } = fillTemplate({ subject: "s", body: "One.\n\nTwo." }, values);
    expect(html).toBe('<p style="margin:0 0 14px">One.</p>\n<p style="margin:0 0 14px">Two.</p>');
  });

  it("keeps a single newline as a line break", () => {
    const { html } = fillTemplate({ subject: "s", body: "Regards,\nFINCLUST" }, values);
    expect(html).toContain("Regards,<br />FINCLUST");
  });

  it("drops a line whose only content was an empty placeholder", () => {
    // Most invoices carry no due date; the template must not leave a stranded
    // "Payment is due by ." sentence behind.
    const { html } = fillTemplate({ subject: "s", body: "Hello.\n\nDue {due_date}.\n\nBye." }, values);
    expect(html).not.toContain("Due");
    expect(html).toContain("Hello.");
    expect(html).toContain("Bye.");
  });

  it("escapes a customer name containing markup", () => {
    const { html } = fillTemplate(DEFAULT_TEMPLATES.client, {
      ...values,
      customer: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("leaves the subject as plain text, because a subject is not HTML", () => {
    const { subject } = fillTemplate({ subject: "Invoice from {company}", body: "x" }, {
      ...values,
      company: "A & B <Ltd>",
    });
    expect(subject).toBe("Invoice from A & B <Ltd>");
  });

  it("ignores a placeholder the app does not know", () => {
    const { html } = fillTemplate({ subject: "s", body: "Hi {nonsense} there" }, values);
    expect(html).toContain("{nonsense}");
  });
});
