export type InvoiceState = "DRAFT" | "ISSUED" | "CANCELLED";
export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";

/** Status is derived, never stored, so it can't go stale when a due date passes. */
export function deriveStatus(
  inv: { state: InvoiceState; totalMinor: number; paidMinor: number; dueDate: string | null },
  today: string,
): InvoiceStatus {
  if (inv.state === "CANCELLED") return "cancelled";
  if (inv.state === "DRAFT") return "draft";
  if (inv.paidMinor >= inv.totalMinor) return "paid";
  if (inv.dueDate !== null && today > inv.dueDate) return "overdue";
  return inv.paidMinor > 0 ? "partial" : "sent";
}
