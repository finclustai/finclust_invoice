import { describe, expect, it } from "vitest";
import { deriveStatus } from "./status";

const base = { state: "ISSUED" as const, totalMinor: 1000, paidMinor: 0, dueDate: "2026-09-15" };
const today = "2026-09-10";

describe("deriveStatus", () => {
  it.each([
    [{ ...base, state: "DRAFT" as const }, "draft"],
    [{ ...base, state: "CANCELLED" as const, paidMinor: 1000 }, "cancelled"],
    [base, "sent"],
    [{ ...base, paidMinor: 400 }, "partial"],
    [{ ...base, paidMinor: 1000 }, "paid"],
    [{ ...base, paidMinor: 1200 }, "paid"],
    [{ ...base, dueDate: "2026-09-09" }, "overdue"],
    [{ ...base, dueDate: "2026-09-09", paidMinor: 400 }, "overdue"],
    [{ ...base, dueDate: "2026-09-10" }, "sent"], // due today is not overdue yet
    [{ ...base, dueDate: null }, "sent"],
  ])("%o → %s", (inv, status) => {
    expect(deriveStatus(inv, today)).toBe(status);
  });
});
