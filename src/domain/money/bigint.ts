/**
 * The single crossing between Prisma's BigInt money columns and the domain's
 * numbers. Both directions refuse anything lossy: the failure this exists to
 * prevent is a wrong amount that nobody notices.
 */
export function fromMinor(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`${value} is past the safe integer range`);
  return n;
}

export function toMinor(value: number): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Expected a whole number of minor units, got ${value}`);
  }
  return BigInt(value);
}

/** Qty is stored as thousandths, so 0.1 + 0.2 arithmetic never reaches the database. */
export function toQtyMilli(qty: number): number {
  const milli = Math.round(qty * 1000);
  if (Math.abs(milli - qty * 1000) > 1e-6) {
    throw new RangeError(`Quantity allows at most 3 decimals, got ${qty}`);
  }
  return milli;
}

export function fromQtyMilli(milli: number): number {
  return milli / 1000;
}
