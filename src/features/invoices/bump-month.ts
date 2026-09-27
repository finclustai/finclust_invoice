const MONTHS = [
  { full: "January", short: "Jan" },
  { full: "February", short: "Feb" },
  { full: "March", short: "Mar" },
  { full: "April", short: "Apr" },
  { full: "May", short: "May" },
  { full: "June", short: "Jun" },
  { full: "July", short: "Jul" },
  { full: "August", short: "Aug" },
  { full: "September", short: "Sep" },
  { full: "October", short: "Oct" },
  { full: "November", short: "Nov" },
  { full: "December", short: "Dec" },
] as const;

/**
 * One alternation covering every month, longest form first so "August" is
 * matched whole rather than as "Aug" followed by a stray "ust".
 *
 * A single pass matters: replacing month by month in a loop would turn August
 * into September, then meet that September on the next iteration and push it
 * to October, and on round to January.
 */
const ANY_MONTH = new RegExp(
  `\\b(${MONTHS.flatMap((m) => (m.full === m.short ? [m.full] : [m.full, m.short])).join("|")})\\b`,
  "gi",
);

/** Copies the casing of the word being replaced, so AUGUST → SEPTEMBER. */
function matchCase(replacement: string, original: string): string {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original === original.toLowerCase()) return replacement.toLowerCase();
  return replacement;
}

/**
 * Moves every month name in a line on by one.
 *
 * FINCLUST's line items carry the month they bill for — "Srinivas (August
 * pay - Apex)", "for 15 Days of July Month". Repeating last month's invoice
 * otherwise means retyping each of those, which is exactly where a wrong month
 * slips in.
 *
 * Offered as a suggestion the user ticks, never applied silently: it is a
 * guess about prose, and a wrong guess on a filed invoice is worse than
 * retyping. Word boundaries keep "Mayank" from becoming "Juneank".
 */
export function bumpMonth(text: string): string {
  return text.replace(ANY_MONTH, (matched) => {
    const lower = matched.toLowerCase();
    const index = MONTHS.findIndex((m) => m.full.toLowerCase() === lower || m.short.toLowerCase() === lower);
    if (index === -1) return matched;
    const next = MONTHS[(index + 1) % 12]!;
    const isShort = lower === MONTHS[index]!.short.toLowerCase() && lower !== MONTHS[index]!.full.toLowerCase();
    return matchCase(isShort ? next.short : next.full, matched);
  });
}
