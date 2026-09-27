import { describe, expect, it } from "vitest";
import { amountInWords, integerToWords } from "./words";

describe("integerToWords", () => {
  it.each([
    [0, "indian", "Zero"],
    [7, "indian", "Seven"],
    [19, "indian", "Nineteen"],
    [40, "indian", "Forty"],
    [100, "indian", "One Hundred"],
    [338683, "indian", "Three Lakh Thirty Eight Thousand Six Hundred Eighty Three"],
    [12345678, "indian", "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight"],
    [1500000000, "indian", "One Hundred Fifty Crore"],
    [1326, "international", "One Thousand Three Hundred Twenty Six"],
    [1234567, "international", "One Million Two Hundred Thirty Four Thousand Five Hundred Sixty Seven"],
    [1000000000, "international", "One Billion"],
  ] as const)("%i (%s) → %s", (n, system, words) => {
    expect(integerToWords(n, system)).toBe(words);
  });
});

describe("amountInWords", () => {
  it("writes rupees and paise", () => {
    expect(amountInWords(33868360, "INR")).toBe(
      "Rupees Three Lakh Thirty Eight Thousand Six Hundred Eighty Three and Sixty Paise Only",
    );
  });
  it("omits zero cents", () => {
    expect(amountInWords(132600, "USD")).toBe("US Dollars One Thousand Three Hundred Twenty Six Only");
  });
  it("handles zero", () => {
    expect(amountInWords(0, "INR")).toBe("Rupees Zero Only");
  });
});
