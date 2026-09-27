import type { InvoiceStatus } from "@/domain/invoice/status";

/**
 * One table holding the label and class for each status, so no component ever
 * grows a chain of ternaries over it.
 */
export const STATUS_STYLE: Record<InvoiceStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "status-draft" },
  sent: { label: "Sent", className: "status-sent" },
  partial: { label: "Part paid", className: "status-partial" },
  paid: { label: "Paid", className: "status-paid" },
  overdue: { label: "Overdue", className: "status-overdue" },
  cancelled: { label: "Cancelled", className: "status-cancelled" },
};

/** "2609" -> "September 2026", for the invoice list's month tabs. */
export function periodLabel(period: string): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const year = 2000 + Number(period.slice(0, 2));
  const month = months[Number(period.slice(2)) - 1];
  return month ? `${month} ${year}` : period;
}
