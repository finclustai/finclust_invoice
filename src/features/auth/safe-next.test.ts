import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it.each(["/", "/invoices", "/invoices/abc?tab=history"])("keeps the same-site path %j", (next) => {
    expect(safeNext(next)).toBe(next);
  });

  // The URL parser strips ASCII tab/CR/LF *before* parsing, so these navigate
  // off-site despite starting with "/". A prefix test alone cannot see them.
  it.each(["/\t/evil.com", "/\n/evil.com", "/\r/evil.com"])("blocks the control-char escape %j", (next) => {
    expect(safeNext(next)).toBe("/");
    expect(new URL(safeNext(next), "https://invoices.finclust.ai").origin).toBe(
      "https://invoices.finclust.ai",
    );
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", ""])(
    "blocks %j",
    (next) => {
      expect(safeNext(next)).toBe("/");
    },
  );

  it("normalises a bare relative path, which is still same-site", () => {
    expect(safeNext("invoices")).toBe("/invoices");
  });

  it("never returns a value that resolves off-site", () => {
    for (const probe of ["/\t//evil.com", "/\t\\evil.com", "///evil.com", "/%09/evil.com"]) {
      expect(new URL(safeNext(probe), "https://invoices.finclust.ai").origin).toBe(
        "https://invoices.finclust.ai",
      );
    }
  });
});
