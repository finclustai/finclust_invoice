import { describe, expect, it } from "vitest";
import type { InvoiceLine } from "@/domain/invoice/schema";
import { addRow, blankRow, moveRow, removeRow, updateRow } from "./rows";

const lines: InvoiceLine[] = [
  { id: "a", description: "First", hsnSac: null, qty: 1, rateMinor: 100 },
  { id: "b", description: "Second", hsnSac: null, qty: 2, rateMinor: 200 },
  { id: "c", description: "Third", hsnSac: null, qty: 3, rateMinor: 300 },
];
const ids = (ls: InvoiceLine[]) => ls.map((l) => l.id);

describe("addRow", () => {
  it("appends a blank row with a fresh id", () => {
    const next = addRow(lines);
    expect(next).toHaveLength(4);
    expect(next[3]).toMatchObject({ description: "", qty: 1, rateMinor: 0 });
    expect(new Set(ids(next)).size).toBe(4);
  });
  it("inserts after a given index", () => {
    expect(ids(addRow(lines, 0))).toEqual(["a", expect.any(String), "b", "c"]);
  });
  it("does not mutate the input", () => {
    addRow(lines);
    expect(lines).toHaveLength(3);
  });
});

describe("removeRow", () => {
  it("drops the row", () => {
    expect(ids(removeRow(lines, "b"))).toEqual(["a", "c"]);
  });
  it("leaves one blank row rather than an empty grid", () => {
    // An empty grid has nothing to type into and no way back.
    const one: InvoiceLine[] = [{ id: "only", description: "x", hsnSac: null, qty: 1, rateMinor: 5 }];
    const next = removeRow(one, "only");
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ description: "", rateMinor: 0 });
    expect(next[0]!.id).not.toBe("only");
  });
  it("ignores an unknown id", () => {
    expect(ids(removeRow(lines, "nope"))).toEqual(["a", "b", "c"]);
  });
});

describe("updateRow", () => {
  it("patches only the named row and field", () => {
    const next = updateRow(lines, "b", { rateMinor: 999 });
    expect(next[1]).toEqual({ id: "b", description: "Second", hsnSac: null, qty: 2, rateMinor: 999 });
    expect(next[0]).toBe(lines[0]);
  });
});

describe("moveRow", () => {
  it("reorders", () => {
    expect(ids(moveRow(lines, 0, 2))).toEqual(["b", "c", "a"]);
    expect(ids(moveRow(lines, 2, 0))).toEqual(["c", "a", "b"]);
  });
  it("is a no-op for the same position or an out-of-range index", () => {
    for (const [from, to] of [[1, 1], [-1, 0], [0, 9], [5, 5]] as const) {
      expect(ids(moveRow(lines, from, to))).toEqual(["a", "b", "c"]);
    }
  });
});

describe("blankRow", () => {
  it("starts at qty 1, which is what almost every line wants", () => {
    expect(blankRow()).toMatchObject({ description: "", hsnSac: null, qty: 1, rateMinor: 0 });
  });
  it("gives every row a distinct id, so the diff can track them", () => {
    expect(blankRow().id).not.toBe(blankRow().id);
  });
});
