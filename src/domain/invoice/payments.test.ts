import { describe, expect, it } from "vitest";
import { summarisePayments, PAYMENT_METHODS, isPaymentMethod } from "./payments";

const p = (amountMinor: number) => ({ amountMinor });

describe("summarisePayments", () => {
  it("adds nothing up to nothing outstanding on a zero invoice", () => {
    expect(summarisePayments([], 0)).toEqual({
      paidMinor: 0,
      outstandingMinor: 0,
      overpaidMinor: 0,
      isSettled: false,
    });
  });

  it("reports what is still owed", () => {
    expect(summarisePayments([p(10000)], 33868360)).toMatchObject({
      paidMinor: 10000,
      outstandingMinor: 33858360,
      isSettled: false,
    });
  });

  it("settles exactly", () => {
    // A part payment of 2,00,000 then the balance of 1,38,683.60.
    expect(summarisePayments([p(20000000), p(13868360)], 33868360)).toMatchObject({
      paidMinor: 33868360,
      outstandingMinor: 0,
      overpaidMinor: 0,
      isSettled: true,
    });
  });

  it("never reports a negative amount outstanding", () => {
    // An overpayment is a real thing — a rounded transfer, an advance — and it
    // must read as "settled, 100 over", not "minus 100 still owed".
    expect(summarisePayments([p(33868460)], 33868360)).toMatchObject({
      outstandingMinor: 0,
      overpaidMinor: 100,
      isSettled: true,
    });
  });

  it("does not call a zero-value invoice settled", () => {
    // 0 >= 0 would otherwise mark an empty invoice paid the moment it exists.
    expect(summarisePayments([], 0).isSettled).toBe(false);
  });

  it("handles a refund recorded as a negative amount", () => {
    expect(summarisePayments([p(50000), p(-20000)], 100000)).toMatchObject({
      paidMinor: 30000,
      outstandingMinor: 70000,
      isSettled: false,
    });
  });
});

describe("payment methods", () => {
  it("offers the ways FINCLUST actually gets paid", () => {
    expect(PAYMENT_METHODS).toContain("Bank transfer");
    expect(PAYMENT_METHODS.length).toBeGreaterThan(2);
  });
  it("recognises a known method and rejects anything else", () => {
    expect(isPaymentMethod("Bank transfer")).toBe(true);
    expect(isPaymentMethod("Carrier pigeon")).toBe(false);
  });
});
