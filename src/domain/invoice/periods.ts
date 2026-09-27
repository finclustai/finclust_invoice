/**
 * The twelve months ending with the one `today` falls in, oldest first, as
 * YYMM.
 *
 * Written as arithmetic on a month index rather than by stepping a Date,
 * because stepping a Date backwards through January is where this kind of
 * code usually goes wrong, and because the result must not depend on the
 * server's timezone.
 */
export function recentPeriods(today: string, count = 12): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  // Months since year 0, so going back is plain subtraction.
  const index = year * 12 + (month - 1);

  return Array.from({ length: count }, (_, i) => {
    const at = index - (count - 1 - i);
    const yy = String(Math.floor(at / 12) % 100).padStart(2, "0");
    const mm = String((at % 12) + 1).padStart(2, "0");
    return `${yy}${mm}`;
  });
}
