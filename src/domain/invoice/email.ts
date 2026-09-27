/** Who the message is written for. The same invoice goes to both. */
export type Audience = "client" | "accountant";

export interface EmailTemplate {
  subject: string;
  body: string;
}

/** The only names a template may use; anything else is left as typed. */
export const PLACEHOLDERS = [
  "invoice_number",
  "customer",
  "company",
  "total",
  "invoice_date",
  "due_date",
  "month",
  "count",
] as const;

export type TemplateValues = Record<(typeof PLACEHOLDERS)[number], string>;

export const PLACEHOLDER_HELP: Record<(typeof PLACEHOLDERS)[number], string> = {
  invoice_number: "INV2609001",
  customer: "the customer’s name",
  company: "which of your companies is billing",
  total: "INR 3,38,683.60",
  invoice_date: "September 1, 2026",
  due_date: "blank when the invoice has no due date",
  month: "September 2026 — for the accountant’s pack",
  count: "how many invoices are attached",
};

/**
 * Where the wording starts. An admin edits these in Settings; the send dialog
 * then fills in the values and the sender can still change the result before
 * the draft is created.
 */
export const DEFAULT_TEMPLATES: Record<Audience, EmailTemplate> = {
  client: {
    subject: "Invoice {invoice_number} from {company}",
    body: [
      "Dear {customer},",
      "Please find attached invoice {invoice_number} dated {invoice_date}, for {total}.",
      "Payment is due by {due_date}.",
      "Our bank details are on the invoice. Do let us know if anything needs changing.",
      "Thanks and regards,\n{company}",
    ].join("\n\n"),
  },
  accountant: {
    subject: "{company} — invoices for {month}",
    body: [
      "Hello,",
      "Attached are {count} invoice(s) for {month}, along with a summary spreadsheet showing the taxable value and the tax split for each.",
      "Please let us know if anything is missing.",
      "Thanks and regards,\n{company}",
    ].join("\n\n"),
  },
};

/**
 * Values are typed by hand somewhere in the app and end up inside an HTML
 * email body, so they are escaped on the way in rather than trusted.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function substitute(text: string, values: TemplateValues, escape: boolean): string {
  return text.replace(/\{(\w+)\}/g, (whole: string, name: string) => {
    if (!(PLACEHOLDERS as readonly string[]).includes(name)) return whole;
    const value = values[name as keyof TemplateValues] ?? "";
    return escape ? escapeHtml(value) : value;
  });
}

/**
 * Whether a paragraph mentions something this invoice does not have.
 *
 * The rule is deliberately blunt and easy to predict: a paragraph naming a
 * placeholder that turns out empty is left out entirely. "Payment is due by
 * {due_date}." exists only to say when payment is due, so on an invoice with
 * no due date it should vanish rather than go out as "Payment is due by ."
 */
function mentionsSomethingMissing(original: string, values: TemplateValues): boolean {
  for (const match of original.matchAll(/\{(\w+)\}/g)) {
    const name = match[1] ?? "";
    if (!(PLACEHOLDERS as readonly string[]).includes(name)) continue;
    if ((values[name as keyof TemplateValues] ?? "").trim() === "") return true;
  }
  return false;
}

/**
 * Fills a template and turns it into the simple HTML Zoho shows.
 *
 * A blank line starts a new paragraph and a single newline is a line break —
 * the way people already write email. A paragraph left with nothing but
 * punctuation after an empty placeholder is dropped, so an invoice with no due
 * date does not carry a stranded "Payment is due by ." line.
 */
export function fillTemplate(
  template: EmailTemplate,
  values: TemplateValues,
): { subject: string; html: string } {
  const paragraphs = template.body
    .split(/\n\s*\n/)
    .map((original) => ({ original, filled: substitute(original, values, true) }))
    .filter(({ original, filled }) => filled.trim() !== "" && !mentionsSomethingMissing(original, values))
    .map(({ filled }) => `<p style="margin:0 0 14px">${filled.replace(/\n/g, "<br />")}</p>`);

  return {
    // A subject line is plain text, so it is filled without HTML escaping.
    subject: substitute(template.subject, values, false),
    html: paragraphs.join("\n"),
  };
}
