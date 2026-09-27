/** How FINCLUST actually gets paid. A free-text field invites five spellings
 *  of the same thing and makes the dashboard useless. */
export const PAYMENT_METHODS = [
  "Bank transfer",
  "UPI",
  "Cheque",
  "Cash",
  "Card",
  "Foreign remittance",
  "Other",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

export interface PaymentSummary {
  paidMinor: number;
  /** Never negative: an overpayment is reported separately, not as debt. */
  outstandingMinor: number;
  overpaidMinor: number;
  isSettled: boolean;
}

/**
 * What an invoice's payments add up to.
 *
 * Overpayment is a real thing — a rounded transfer, an advance, a client
 * paying two invoices in one go — so it is reported as its own number rather
 * than as a negative balance that would then subtract from the total
 * outstanding across the business.
 */
export function summarisePayments(
  payments: { amountMinor: number }[],
  totalMinor: number,
): PaymentSummary {
  const paidMinor = payments.reduce((sum, p) => sum + p.amountMinor, 0);
  const difference = totalMinor - paidMinor;
  return {
    paidMinor,
    outstandingMinor: Math.max(0, difference),
    overpaidMinor: Math.max(0, -difference),
    // A zero-value invoice is never "settled": 0 >= 0 would mark an empty one
    // paid the moment it existed.
    isSettled: totalMinor > 0 && paidMinor >= totalMinor,
  };
}
