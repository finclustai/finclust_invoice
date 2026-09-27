/** Who the message is written for. The same invoice goes to both. */
export type Audience = "client" | "accountant";

export interface EmailFacts {
  number: string;
  customerName: string;
  companyName: string;
  total: string;
  issueDate: string;
  dueDate: string | null;
  /** How many invoices are attached; more than one reads as a batch. */
  count: number;
}

/**
 * Every value here is typed by hand somewhere in the app and ends up inside an
 * HTML email body, so it is escaped on the way in rather than trusted.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const P = (text: string) => `<p style="margin:0 0 14px">${text}</p>`;

/**
 * The starting point for the message, which the sender then edits before the
 * draft is created. Two audiences because the same invoice goes to the client
 * who has to pay it and to the accountant who has to file it, and they need
 * different words.
 */
export function buildInvoiceEmail(
  audience: Audience,
  facts: EmailFacts,
): { subject: string; html: string } {
  const e = {
    number: escapeHtml(facts.number),
    customer: escapeHtml(facts.customerName),
    company: escapeHtml(facts.companyName),
    total: escapeHtml(facts.total),
    issueDate: escapeHtml(facts.issueDate),
    dueDate: facts.dueDate ? escapeHtml(facts.dueDate) : null,
  };
  const many = facts.count > 1;

  if (audience === "accountant") {
    const what = many ? `${facts.count} invoices` : `invoice ${e.number}`;
    return {
      subject: many ? `${facts.count} invoices from ${facts.companyName}` : `Invoice ${facts.number} for filing`,
      html: [
        P("Hello,"),
        P(`Attached ${many ? "are" : "is"} ${escapeHtml(what)} from ${e.company}, for your records.`),
        many ? "" : P(`Dated ${e.issueDate}, billed to ${e.customer}, total ${e.total}.`),
        P("Let me know if anything is missing."),
        P(`Thanks,<br />${e.company}`),
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  return {
    subject: `Invoice ${facts.number} from ${facts.companyName}`,
    html: [
      P(`Dear ${e.customer},`),
      P(`Please find attached invoice <strong>${e.number}</strong> dated ${e.issueDate}, for ${e.total}.`),
      e.dueDate ? P(`Payment is due by <strong>${e.dueDate}</strong>.`) : "",
      P("Bank details are on the invoice. Do let me know if you need anything changed."),
      P(`Thanks,<br />${e.company}`),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
