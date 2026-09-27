/** Period is YYMM of the invoice date. Dates are ISO strings to avoid timezone drift. */
export function periodOf(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(isoDate);
  if (!match) throw new Error(`Invalid ISO date: ${isoDate}`);
  return match[1]!.slice(2) + match[2]!;
}

export function formatInvoiceNumber(period: string, seq: number): string {
  if (!/^\d{4}$/.test(period)) throw new Error(`Invalid period: ${period}`);
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`Invalid sequence: ${seq}`);
  return `INV${period}${String(seq).padStart(3, "0")}`;
}
