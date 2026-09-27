import { formatAmount, type CurrencyCode } from "../money/currency";
import type { InvoiceLine, InvoiceSnapshot } from "./schema";

export interface Change {
  label: string;
  from: string;
  to: string;
}

const dash = (v: string | null) => v ?? "—";
const gst = (s: InvoiceSnapshot) => (s.gstEnabled ? `On @ ${s.taxRateBp / 100}%` : "Off");
const describeLine = (l: InvoiceLine, c: CurrencyCode) =>
  `${l.description} · ${l.qty} × ${formatAmount(l.rateMinor, c)}`;

/**
 * Human-readable changes between two versions. Lines are matched by id, so
 * editing a row reads as "Line 2 rate", not "removed + added".
 * ponytail: pure reordering isn't reported; add a "moved" change if anyone asks.
 */
export function diffSnapshots(before: InvoiceSnapshot, after: InvoiceSnapshot): Change[] {
  const changes: Change[] = [];
  const field = (label: string, from: string, to: string) => {
    if (from !== to) changes.push({ label, from, to });
  };

  field("Seller", before.companyName, after.companyName);
  field("Customer", before.customer.name, after.customer.name);
  field("Bill-to address", before.customer.addressLines.join(", "), after.customer.addressLines.join(", "));
  field("Customer GSTIN", dash(before.customer.gstin), dash(after.customer.gstin));
  field("Invoice date", before.issueDate, after.issueDate);
  field("Due date", dash(before.dueDate), dash(after.dueDate));
  field("Payment terms", dash(before.paymentTerms), dash(after.paymentTerms));
  field("Currency", before.currency, after.currency);
  field("GST", gst(before), gst(after));
  field("Template", before.template, after.template);
  field("Notes", dash(before.notes), dash(after.notes));

  const remaining = new Map(before.lines.map((line, index) => [line.id, { line, index }]));
  after.lines.forEach((line, i) => {
    const n = `Line ${i + 1}`;
    const old = remaining.get(line.id);
    if (!old) {
      changes.push({ label: `${n} added`, from: "", to: describeLine(line, after.currency) });
      return;
    }
    remaining.delete(line.id);
    field(`${n} description`, old.line.description, line.description);
    field(`${n} HSN/SAC`, dash(old.line.hsnSac), dash(line.hsnSac));
    field(`${n} qty`, String(old.line.qty), String(line.qty));
    field(
      `${n} rate`,
      formatAmount(old.line.rateMinor, before.currency),
      formatAmount(line.rateMinor, after.currency),
    );
  });
  for (const { line, index } of remaining.values()) {
    changes.push({ label: `Line ${index + 1} removed`, from: describeLine(line, before.currency), to: "" });
  }
  return changes;
}
