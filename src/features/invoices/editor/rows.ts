import type { InvoiceLine } from "@/domain/invoice/schema";

/**
 * Pure line-list operations, so the grid component only has to wire events.
 * Every one returns a new array; none mutates its input.
 */
export function blankRow(): InvoiceLine {
  // Qty 1 is what almost every line wants, and a 0 would fail validateForIssue.
  return { id: crypto.randomUUID(), description: "", hsnSac: null, qty: 1, rateMinor: 0 };
}

export function addRow(lines: InvoiceLine[], after?: number): InvoiceLine[] {
  const next = [...lines];
  next.splice(after === undefined ? next.length : after + 1, 0, blankRow());
  return next;
}

export function removeRow(lines: InvoiceLine[], id: string): InvoiceLine[] {
  const next = lines.filter((l) => l.id !== id);
  // An empty grid gives the user nothing to type into and no way back.
  return next.length ? next : [blankRow()];
}

export function updateRow(
  lines: InvoiceLine[],
  id: string,
  patch: Partial<Omit<InvoiceLine, "id">>,
): InvoiceLine[] {
  return lines.map((l) => (l.id === id ? { ...l, ...patch } : l));
}

export function moveRow(lines: InvoiceLine[], from: number, to: number): InvoiceLine[] {
  if (from === to || from < 0 || to < 0 || from >= lines.length || to >= lines.length) return lines;
  const next = [...lines];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}
