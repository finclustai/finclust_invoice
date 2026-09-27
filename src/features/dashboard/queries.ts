import "server-only";
import { summariseAging, type AgingRow } from "@/domain/invoice/aging";
import { recentPeriods } from "@/domain/invoice/periods";
import { deriveStatus } from "@/domain/invoice/status";
import { businessDay } from "@/domain/invoice/today";
import { fromMinor } from "@/domain/money/bigint";
import type { CurrencyCode } from "@/domain/money/currency";
import { db } from "@/infra/db";

export interface CurrencySummary {
  currency: CurrencyCode;
  billedThisMonthMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  taxThisMonthMinor: number;
  /** Twelve months ending with the current one, oldest first. */
  monthly: { period: string; billedMinor: number }[];
  aging: AgingRow[];
  topCustomers: { name: string; billedMinor: number }[];
}

/**
 * Everything the dashboard shows, split by currency.
 *
 * Deliberately never totalled across currencies: adding rupees to dollars
 * gives a number that means nothing, and a headline figure that means nothing
 * is worse than no headline at all.
 */
export async function loadDashboard(): Promise<{ today: string; currencies: CurrencySummary[] }> {
  const today = businessDay();
  const thisPeriod = `${today.slice(2, 4)}${today.slice(5, 7)}`;
  const periods = recentPeriods(today);

  const invoices = await db.invoice.findMany({
    where: { state: { not: "DRAFT" } },
    select: {
      period: true,
      state: true,
      currency: true,
      dueDate: true,
      totalMinor: true,
      taxMinor: true,
      paidMinor: true,
      customerSnapshot: true,
    },
  });

  const byCurrency = new Map<string, typeof invoices>();
  for (const invoice of invoices) {
    const list = byCurrency.get(invoice.currency) ?? [];
    list.push(invoice);
    byCurrency.set(invoice.currency, list);
  }

  const currencies: CurrencySummary[] = [];
  for (const [currency, rows] of [...byCurrency].sort(([a], [b]) => a.localeCompare(b))) {
    const live = rows.filter((r) => r.state !== "CANCELLED");

    const outstanding = live.map((r) => ({
      dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
      outstandingMinor: Math.max(0, fromMinor(r.totalMinor) - fromMinor(r.paidMinor)),
      status: deriveStatus(
        {
          state: r.state,
          totalMinor: fromMinor(r.totalMinor),
          paidMinor: fromMinor(r.paidMinor),
          dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
        },
        today,
      ),
    }));

    const customers = new Map<string, number>();
    for (const r of live) {
      const name = (r.customerSnapshot as { name?: string } | null)?.name?.trim() || "—";
      customers.set(name, (customers.get(name) ?? 0) + fromMinor(r.totalMinor));
    }

    currencies.push({
      currency: currency as CurrencyCode,
      billedThisMonthMinor: live
        .filter((r) => r.period === thisPeriod)
        .reduce((sum, r) => sum + fromMinor(r.totalMinor), 0),
      taxThisMonthMinor: live
        .filter((r) => r.period === thisPeriod)
        .reduce((sum, r) => sum + fromMinor(r.taxMinor), 0),
      outstandingMinor: outstanding.reduce((sum, r) => sum + r.outstandingMinor, 0),
      overdueMinor: outstanding
        .filter((r) => r.status === "overdue")
        .reduce((sum, r) => sum + r.outstandingMinor, 0),
      monthly: periods.map((period) => ({
        period,
        billedMinor: live
          .filter((r) => r.period === period)
          .reduce((sum, r) => sum + fromMinor(r.totalMinor), 0),
      })),
      aging: summariseAging(outstanding, today),
      topCustomers: [...customers]
        .map(([name, billedMinor]) => ({ name, billedMinor }))
        .sort((a, b) => b.billedMinor - a.billedMinor)
        .slice(0, 5),
    });
  }

  return { today, currencies };
}
