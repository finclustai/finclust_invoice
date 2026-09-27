import { describe, expect, it } from "vitest";
import { bumpMonth } from "./bump-month";

describe("bumpMonth", () => {
  it("moves a full month name on, keeping the rest of the line", () => {
    expect(bumpMonth("Srinivas Caratlane project (August pay - Apex)")).toBe(
      "Srinivas Caratlane project (September pay - Apex)",
    );
  });

  it("moves a short month name on", () => {
    expect(bumpMonth("Paid on Aug-7")).toBe("Paid on Sep-7");
  });

  it("moves every month it finds, which is what a two-month line needs", () => {
    expect(bumpMonth("for 15 Days of July Month, billed August")).toBe(
      "for 15 Days of August Month, billed September",
    );
  });

  it("wraps December round to January", () => {
    expect(bumpMonth("December retainer")).toBe("January retainer");
  });

  it("keeps the capitalisation it was given", () => {
    expect(bumpMonth("august pay")).toBe("september pay");
    expect(bumpMonth("AUGUST PAY")).toBe("SEPTEMBER PAY");
  });

  it("leaves a line with no month alone", () => {
    expect(bumpMonth("Cook Medical (other)")).toBe("Cook Medical (other)");
    expect(bumpMonth("")).toBe("");
  });

  it("does not touch a month name buried inside a word", () => {
    // "Mayank" is a name, not May; "Marchant" is not March.
    expect(bumpMonth("Mayank Sharma")).toBe("Mayank Sharma");
    expect(bumpMonth("Marchant account")).toBe("Marchant account");
  });

  it("does not mistake an abbreviation inside a longer word", () => {
    expect(bumpMonth("Augmented reality work")).toBe("Augmented reality work");
  });
});
