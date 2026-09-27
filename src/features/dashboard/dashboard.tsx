import Link from "next/link";
import { formatAmount, formatMoney, type CurrencyCode } from "@/domain/money/currency";
import { periodLabel } from "@/features/invoices/status-style";
import type { CurrencySummary } from "./queries";

/*
 * Every chart here is one series in one hue, with the category carried by
 * position and the value printed on the mark.
 *
 * The brand orange measures 2.32:1 against this paper, which is too light for
 * a fill that has to mean something, so the data uses a deeper step of the same
 * hue at 4.64:1. Printing the value on each bar is what makes the chart
 * readable without relying on the colour at all.
 */
const DATA = "#b35c00";

export function Dashboard({ currencies, today }: { currencies: CurrencySummary[]; today: string }) {
  if (currencies.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6">
        <h1 className="text-2xl">Dashboard</h1>
        <div className="card mt-4 p-8 text-center">
          <h2 className="font-extrabold">Nothing to show yet</h2>
          <p className="mt-1 text-sm text-body">
            Issue your first invoice and this fills in.{" "}
            <Link href="/invoices" className="underline">
              Go to invoices
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-2xl">Dashboard</h1>
        <p className="mt-0.5 text-sm text-mid">
          Figures are kept separate per currency — adding rupees to dollars would mean nothing.
        </p>
      </header>

      <div className="space-y-8">
        {currencies.map((c) => (
          <CurrencySection key={c.currency} summary={c} today={today} />
        ))}
      </div>
    </main>
  );
}

function CurrencySection({ summary, today }: { summary: CurrencySummary; today: string }) {
  const { currency } = summary;
  const thisMonth = periodLabel(`${today.slice(2, 4)}${today.slice(5, 7)}`);
  const billedMonths = summary.monthly.filter((m) => m.billedMinor > 0);
  const lateBuckets = summary.aging.filter((a) => a.bucket !== "current" && a.amountMinor > 0);

  return (
    <section>
      <h2 className="mb-3 flex items-baseline gap-2">
        <span className="font-mono text-sm font-bold">{currency}</span>
        <span className="text-xs text-mid">{thisMonth}</span>
      </h2>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Billed this month" value={formatMoney(summary.billedThisMonthMinor, currency)} />
        <Stat label="Still owed" value={formatMoney(summary.outstandingMinor, currency)} />
        <Stat
          label="Overdue"
          value={formatMoney(summary.overdueMinor, currency)}
          alarming={summary.overdueMinor > 0}
        />
        <Stat
          label="GST this month"
          value={formatMoney(summary.taxThisMonthMinor, currency)}
          hint="What you have collected and will owe"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Only months that had invoices: eleven rows of 0.00 told you nothing
            and pushed everything that matters below the fold. */}
        {billedMonths.length > 0 && (
          <Card title="Billed each month" subtitle={`${billedMonths.length} of the last 12 months`}>
            <Bars
              rows={billedMonths.map((m) => ({
                label: periodLabel(m.period).replace(/ (\d{2})\d{2}$/, " ’$1"),
                value: m.billedMinor,
              }))}
              currency={currency}
            />
          </Card>
        )}

        {/* Only when something is actually late. A column of zeroes is not
            reassurance, it is noise. */}
        {lateBuckets.length > 0 && (
          <Card title="How overdue" subtitle="What is owed, by how late it is">
            <Bars
              rows={lateBuckets.map((a) => ({
                label: a.label,
                value: a.amountMinor,
                note: `${a.count}`,
              }))}
              currency={currency}
            />
          </Card>
        )}

        {summary.topCustomers.length > 0 && (
          <Card
            title="Biggest customers"
            subtitle="By total billed"
            className={lateBuckets.length > 0 && billedMonths.length > 0 ? "lg:col-span-2" : ""}
          >
            <Bars
              rows={summary.topCustomers.map((c) => ({ label: c.name, value: c.billedMinor }))}
              currency={currency}
            />
          </Card>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  alarming,
}: {
  label: string;
  value: string;
  hint?: string;
  alarming?: boolean;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold tracking-wide text-mid uppercase">{label}</p>
      <p className={`tnum mt-1 text-xl font-extrabold ${alarming ? "text-red" : ""}`}>{value}</p>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

function Card({
  title,
  subtitle,
  className = "",
  children,
}: {
  title: string;
  subtitle: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`card p-4 ${className}`}>
      <h3 className="font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-mid">{subtitle}</p>
      {children}
    </div>
  );
}

/**
 * Horizontal bars, because the labels are words ("Over 90 days late", a company
 * name) and words read badly rotated under a column.
 *
 * The value is printed on every row, so the chart is legible from the numbers
 * alone — which is also what makes the light fill acceptable.
 */
function Bars({
  rows,
  currency,
}: {
  rows: { label: string; value: number; note?: string }[];
  currency: CurrencyCode;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (max === 0) return null;

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">
        {rows.length} rows, amounts in {currency}
      </caption>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row" className="w-28 truncate py-1 pr-2 text-left font-normal text-body" title={r.label}>
              {r.label}
            </th>
            <td className="py-1">
              <span className="flex items-center gap-2">
                <span
                  className="h-3.5 rounded-r-[3px]"
                  style={{ width: `max(2px, ${(r.value / max) * 100}%)`, backgroundColor: DATA }}
                  aria-hidden
                />
                <span className="tnum shrink-0 text-xs text-body">
                  {formatAmount(r.value, currency)}
                  {r.note && <span className="text-mid"> · {r.note}</span>}
                </span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
