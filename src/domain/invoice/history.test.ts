import { describe, expect, it } from "vitest";
import type { Change } from "./diff";
import { SESSION_MINUTES, joinsSession, summarise } from "./history";

const at = (minutes: number) => new Date("2026-09-15T10:00:00Z").getTime() + minutes * 60_000;
const head = (over: Partial<Parameters<typeof joinsSession>[0] & object> = {}) => ({
  userId: "u1",
  state: "DRAFT" as const,
  at: at(0),
  ...over,
});

describe("joinsSession", () => {
  it("starts a session when there is nothing to join", () => {
    expect(joinsSession(null, { userId: "u1", state: "DRAFT", at: at(0) })).toBe(false);
  });

  it("joins an edit made a few minutes later by the same person", () => {
    expect(joinsSession(head(), { userId: "u1", state: "DRAFT", at: at(SESSION_MINUTES - 1) })).toBe(true);
  });

  it("starts a new session once the gap is long enough to be a separate sitting", () => {
    expect(joinsSession(head(), { userId: "u1", state: "DRAFT", at: at(SESSION_MINUTES + 1) })).toBe(false);
  });

  it("never merges two people's work", () => {
    // Otherwise the timeline would credit one person with the other's edit.
    expect(joinsSession(head(), { userId: "u2", state: "DRAFT", at: at(1) })).toBe(false);
  });

  it("never merges across a state change", () => {
    // Issuing is a milestone; edits before and after it are different things.
    expect(joinsSession(head(), { userId: "u1", state: "ISSUED", at: at(1) })).toBe(false);
  });

  it("treats an unknown author as its own session rather than merging strangers", () => {
    expect(joinsSession(head({ userId: null }), { userId: null, state: "DRAFT", at: at(1) })).toBe(false);
  });
});

describe("summarise", () => {
  const change = (label: string): Change => ({ label, from: "1", to: "2" });

  it("says so when nothing changed", () => {
    expect(summarise([])).toBe("No changes");
  });
  it("names a single change", () => {
    expect(summarise([change("Line 2 rate")])).toBe("Line 2 rate");
  });
  it("names two", () => {
    expect(summarise([change("Line 2 rate"), change("Due date")])).toBe("Line 2 rate and Due date");
  });
  it("counts the rest beyond two, so the line stays scannable", () => {
    expect(summarise(["Line 2 rate", "Due date", "Notes", "Currency"].map(change))).toBe(
      "Line 2 rate, Due date and 2 more",
    );
  });
});
