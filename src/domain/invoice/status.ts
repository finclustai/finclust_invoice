export type InvoiceState = "DRAFT" | "ISSUED" | "CANCELLED";
export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";

/** Status is derived, never stored, so it can't go stale when a due date passes. */
export function deriveStatus(
  inv: { state: InvoiceState; totalMinor: number; paidMinor: number; dueDate: string | null },
  today: string,
): InvoiceStatus {
  if (inv.state === "CANCELLED") return "cancelled";
  if (inv.state === "DRAFT") return "draft";
  // The totalMinor > 0 guard stops a zero-value invoice reporting itself as
  // paid (0 >= 0) and dropping off everyone's follow-up list.
  if (inv.totalMinor > 0 && inv.paidMinor >= inv.totalMinor) return "paid";
  if (inv.dueDate !== null && today > inv.dueDate) return "overdue";
  return inv.paidMinor > 0 ? "partial" : "sent";
}
