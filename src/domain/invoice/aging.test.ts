import { describe, expect, it } from "vitest";
import { AGING_BUCKETS, bucketFor, summariseAging } from "./aging";

describe("bucketFor", () => {
  it("is 'not due yet' before the due date", () => {
    expect(bucketFor("2026-10-15", "2026-09-27")).toBe("current");
  });
  it("is still current on the due date itself", () => {
    expect(bucketFor("2026-09-27", "2026-09-27")).toBe("current");
  });
  it.each([
    ["2026-09-26", "1-30"],
    ["2026-08-29", "1-30"],
    ["2026-08-27", "31-60"],
    ["2026-07-29", "31-60"],
    ["2026-07-27", "61-90"],
    ["2026-06-01", "90+"],
  ])("due %s is %s days overdue", (dueDate, bucket) => {
    expect(bucketFor(dueDate, "2026-09-27")).toBe(bucket);
  });
  it("treats an invoice with no due date as current, not ancient", () => {
    // Most FINCLUST invoices carry no due date; defaulting them to overdue
    // would make the whole ledger look alarming and useless.
    expect(bucketFor(null, "2026-09-27")).toBe("current");
  });
});

describe("summariseAging", () => {
  it("returns every bucket, so an empty one still shows as zero", () => {
    expect(summariseAging([], "2026-09-27").map((b) => b.bucket)).toEqual([...AGING_BUCKETS]);
  });

  it("adds what is outstanding into the right bucket", () => {
    const result = summariseAging(
      [
        { dueDate: "2026-10-15", outstandingMinor: 10000 },
        { dueDate: "2026-09-01", outstandingMinor: 25000 },
        { dueDate: "2026-05-01", outstandingMinor: 50000 },
      ],
      "2026-09-27",
    );
    const by = Object.fromEntries(result.map((b) => [b.bucket, b.amountMinor]));
    expect(by.current).toBe(10000);
    expect(by["1-30"]).toBe(25000);
    expect(by["90+"]).toBe(50000);
    expect(by["31-60"]).toBe(0);
  });

  it("counts the invoices as well as the money", () => {
    const result = summariseAging(
      [
        { dueDate: "2026-09-01", outstandingMinor: 100 },
        { dueDate: "2026-09-02", outstandingMinor: 200 },
      ],
      "2026-09-27",
    );
    expect(result.find((b) => b.bucket === "1-30")).toMatchObject({ count: 2, amountMinor: 300 });
  });

  it("ignores anything already settled", () => {
    const result = summariseAging([{ dueDate: "2026-01-01", outstandingMinor: 0 }], "2026-09-27");
    expect(result.every((b) => b.amountMinor === 0 && b.count === 0)).toBe(true);
  });
});
