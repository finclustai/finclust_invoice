/**
 * The calendar day in India, as YYYY-MM-DD.
 *
 * Everything dated in this app — when an invoice is overdue, which month's
 * series its number comes from — is a business fact about a Bangalore company,
 * not about the server's timezone. Between 00:00 and 05:30 IST the UTC day is
 * still yesterday, which is long enough to mislabel a day's invoices every
 * single night.
 *
 * en-CA is used because it formats as YYYY-MM-DD, which is what every date
 * comparison and `<input type="date">` in the app expects.
 */
export function businessDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}
