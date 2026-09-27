# Plan 1: Foundation + Domain Core (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running Next.js app with Supabase-backed login and roles, the full `invoicing` database schema seeded with FINCLUST's two real invoices, and a pure, fully tested domain core (money, GST, totals, words, numbering, status, diff) that every later plan builds on.

**Architecture:** The Next.js 15 app is feature-sliced (`src/domain` is pure TypeScript, `src/features` holds slices, `src/infra` holds adapters, `src/app` holds thin routes).
- The domain core is a few deep modules with small interfaces. `calculateInvoice()` hides money rounding, the GST regime, tax split and amount-in-words. The UI, PDF and CSV only ever call it.
- Prisma uses the existing Supabase Postgres through `?schema=invoicing`, so nothing touches the career site's `public` tables.

**Tech Stack:** Next.js ^15.1.6, React ^19, TypeScript ^5.7, Tailwind CSS ^4 (`@tailwindcss/postcss`), Prisma ^6.19.3, zod ^3.24, jose ^5.9, bcryptjs ^2.4.3, vitest ^3, tsx, pnpm.

**Spec:** [docs/superpowers/specs/2026-09-27-invoice-generator-design.md](../specs/2026-09-27-invoice-generator-design.md)

**Plan series:**
1. **This plan:** foundation + domain.
2. Split editor + PDF (Classic template) + autosave + download.
3. History: versions, activity, PDF archive, diff UI, restore.
4. Customers, catalog, duplicate, extra templates.
5. Payments, status, invoice list.
6. Delivery: Zoho, CA pack, WhatsApp.
7. Dashboard + ⌘K.

## Global Constraints
- Money is stored as **integer minor units** (paise/cents) everywhere. DB columns are `BigInt`. Floats never hold money.
- Qty allows at most 3 decimals and is stored as `qtyMilli` (Int).
- Invoice number: `INV{YY}{MM}{NNN}`. The period comes from the **invoice date**, the counter resets monthly, and there is **one shared series across all companies**.
- GST:
  - Same state as the seller: CGST + SGST at half the rate each.
  - Different Indian state: IGST.
  - Place of supply outside India (customer `stateCode = null`): export under LUT, no tax.
  - GST off: no tax.
  - The default rate is 18% (`taxRateBp = 1800`).
- Currencies: `INR` (en-IN lakh grouping, "Rupees…Paise") and `USD` (en-US, "US Dollars…Cents"). No FX conversion.
- Roles: `ADMIN` (everything), `ACCOUNTANT` (read, write, send), `VIEWER` (read only).
- Invoices are never hard-deleted. The states are `DRAFT | ISSUED | CANCELLED`, and payment status is derived.
- `src/domain/**` imports nothing outside `src/domain` except `zod`.
- `src/app/**` holds no business logic.
- Design: "Evolved FINCLUST". Hanken Grotesk + JetBrains Mono, warm neutrals, orange `#ff8a1e`, 1px soft borders, soft shadows (no hard offsets), dark mode through `prefers-color-scheme`, ink focus outline.
- Dev server port **3100** (the career site uses 3000).

## Review Focus
1. **Money typed with Indian commas or stray separators** ("25,00.00", "37,500.", "₹ 3,38,683.60"): it should parse to the obvious amount. Garbage or 3-decimal input should return `null`, never a wrong number. *Test in Task 2.*
2. **Fractional qty × rate hitting half-paise** (1.5 × ₹333.33): it should round once per line, half away from zero, never with float drift. *Test in Task 4.*
3. **Indian customer with a state code but no GSTIN (unregistered), or a customer outside India:** the tax regime should still follow place of supply (IGST/CGST+SGST, or export). *Test in Task 4.*
4. **Two people creating invoices in the same month at the same moment:** they should get distinct consecutive numbers, never a duplicate. *Test in Task 8 (integration).*
5. **A deactivated user or a VIEWER calling a write server action directly (bypassing the UI):** it should be rejected server-side. *Test in Task 9 (`authorize`).*

---

## File Map
```
package.json, tsconfig.json, next.config.ts, postcss.config.mjs, vitest.config.ts, .env.example
src/env.ts                              validated env
src/app/globals.css                     design tokens (light + dark)
src/app/layout.tsx                      fonts, html shell
src/app/login/page.tsx                  login screen
src/app/(app)/layout.tsx                authenticated shell (requireUser)
src/app/(app)/page.tsx                  home placeholder
src/app/logout/route.ts                 POST sign-out
src/middleware.ts                       redirect unauthenticated → /login
src/domain/money/currency.ts            CURRENCIES, formatMoney, formatAmount, parseMoney
src/domain/money/words.ts               integerToWords, amountInWords
src/domain/invoice/calculate.ts         calculateInvoice, taxRegime  ← main deep module
src/domain/invoice/numbering.ts         periodOf, formatInvoiceNumber
src/domain/invoice/status.ts            deriveStatus
src/domain/invoice/schema.ts            zod draft schema, validateForIssue, GSTIN helpers
src/domain/invoice/diff.ts              diffSnapshots
src/infra/db.ts                         Prisma client singleton + P1001 retry
src/features/invoices/allocate-number.ts  atomic counter
src/features/auth/permissions.ts        Role, Action, can, authorize, AuthError
src/features/auth/session.ts            signSession / verifySession (jose, edge-safe)
src/features/auth/password.ts           verifyCredentials (timing-equalised)
src/features/auth/current-user.ts       getCurrentUser, requireUser (server-only)
src/features/auth/login-action.ts       server action
prisma/schema.prisma, prisma/seed.ts
```

---

### Task 1: Scaffold the app with design tokens

**Files:** Create `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `next-env.d.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx` (temporary), `src/domain/smoke.test.ts` (deleted in Task 2), and modify `.gitignore`.

**Interfaces:** Produces the `@/*` → `src/*` alias (tsconfig + vitest) and the Tailwind colour utilities `bg-paper bg-shell bg-sand text-ink text-body text-mid border-line bg-orange text-green text-red` plus `shadow-soft`, `shadow-pop`, `font-mono`.

- [ ] **Step 1: Write the config files**

`package.json`
```json
{
  "name": "finclust-invoice",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3100",
    "build": "next build",
    "start": "next start -p 3100",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^15.1.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.3",
    "@types/node": "^22.13.1",
    "@types/react": "^19.0.8",
    "@types/react-dom": "^19.0.3",
    "tailwindcss": "^4.0.3",
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  }
}
```

`tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`
```ts
import type { NextConfig } from "next";

const config: NextConfig = {};

export default config;
```

`postcss.config.mjs`
```js
export default { plugins: { "@tailwindcss/postcss": {} } };
```

`vitest.config.ts`
```ts
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Node 22's built-in .env loader, so integration tests see TEST_DATABASE_URL
// without adding dotenv or a wrapper script.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
```

`next-env.d.ts`
```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

Append to `.gitignore`:
```
next-env.d.ts
*.tsbuildinfo
```

- [ ] **Step 2: Write the design tokens**

`src/app/globals.css`
```css
@import "tailwindcss";

/*
 * "Evolved FINCLUST": the career site's warm palette (E:\sudheer\design-system\finclust\MASTER.md)
 * made calmer for a dense daily tool: 1px soft borders and soft shadows instead
 * of hard ink offsets. Components never carry raw hex values; they use these tokens.
 */
:root {
  --paper: #ffffff;
  --shell: #fffdf8;
  --sand: #f9f6ee;
  --ink: #15140f;
  --body: #4a463d;
  --mid: #6b665c;
  --placeholder: #9b958a;
  --line: #e7e1d3;
  --line-strong: #d6cebb;
  --orange: #ff8a1e;
  --orange-tint: #fff1e2;
  --green: #1f9d5a;
  --green-tint: #e3f7ec;
  --red: #e0352b;
  --red-tint: #fde7e5;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root {
    --paper: #1c1b17;
    --shell: #141310;
    --sand: #24221d;
    --ink: #f4f1e8;
    --body: #cfc9bb;
    --mid: #a39d90;
    --placeholder: #7a7568;
    --line: #34312a;
    --line-strong: #4a463d;
    --orange: #ff9a3d;
    --orange-tint: #3a2a18;
    --green: #3dd68c;
    --green-tint: #173226;
    --red: #ff6b61;
    --red-tint: #3a1d1b;
    color-scheme: dark;
  }
}

@theme inline {
  --color-paper: var(--paper);
  --color-shell: var(--shell);
  --color-sand: var(--sand);
  --color-ink: var(--ink);
  --color-body: var(--body);
  --color-mid: var(--mid);
  --color-placeholder: var(--placeholder);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-orange: var(--orange);
  --color-orange-tint: var(--orange-tint);
  --color-green: var(--green);
  --color-green-tint: var(--green-tint);
  --color-red: var(--red);
  --color-red-tint: var(--red-tint);

  --radius-input: 8px;
  --radius-card: 12px;
  --radius-modal: 16px;

  --shadow-soft: 0 1px 2px rgb(21 20 15 / 0.06), 0 1px 1px rgb(21 20 15 / 0.04);
  --shadow-pop: 0 8px 24px rgb(21 20 15 / 0.12), 0 2px 6px rgb(21 20 15 / 0.08);

  --font-sans: var(--font-hanken), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;
}

@layer base {
  html { -webkit-text-size-adjust: 100%; overflow-x: hidden; }
  body {
    background: var(--shell);
    color: var(--ink);
    font-family: var(--font-sans);
    line-height: 1.5;
  }
  h1, h2, h3 { line-height: 1.15; letter-spacing: -0.02em; font-weight: 800; }
  /* Ink outline, not an orange ring: orange on white is only 2.35:1. */
  :focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .tnum, input[type="number"] { font-variant-numeric: tabular-nums; }
}

@layer components {
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
    min-height: 40px; padding: 0.5rem 1rem;
    border: 1px solid var(--line-strong); border-radius: var(--radius-input);
    background: var(--paper); color: var(--ink);
    box-shadow: var(--shadow-soft);
    font-weight: 600; font-size: 0.875rem; cursor: pointer;
    transition: background-color 150ms ease-out, transform 100ms ease-out, border-color 150ms ease-out;
  }
  .btn:hover:not(:disabled) { background: var(--sand); }
  .btn:active:not(:disabled) { transform: translateY(1px); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  /* Ink label on orange, never white (contrast). */
  .btn-primary { background: var(--orange); border-color: var(--orange); color: #15140f; }
  .btn-primary:hover:not(:disabled) { background: #ff9c3d; }

  .field {
    width: 100%; min-height: 40px; padding: 0.5rem 0.75rem;
    border: 1px solid var(--line-strong); border-radius: var(--radius-input);
    background: var(--paper); color: var(--ink); font-size: 0.9375rem;
    transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
  }
  .field::placeholder { color: var(--placeholder); }
  .field:focus { outline: none; border-color: var(--ink); box-shadow: 0 0 0 3px var(--orange-tint); }

  .card { background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius-card); box-shadow: var(--shadow-soft); }
}
```

- [ ] **Step 3: Write the root layout and temporary page**

`src/app/layout.tsx`
```tsx
import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = { title: "FINCLUST Invoices" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${hanken.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
```

`src/app/page.tsx` (temporary; replaced by `(app)/page.tsx` in Task 9)
```tsx
export default function Home() {
  return <main className="p-8"><h1 className="text-2xl">FINCLUST Invoices</h1></main>;
}
```

`src/domain/smoke.test.ts` (temporary, proves vitest and the alias work)
```ts
import { expect, it } from "vitest";

it("runs", () => expect(1 + 1).toBe(2));
```

- [ ] **Step 4: Install and verify**

Run: `pnpm install && pnpm test && pnpm typecheck && pnpm build`
Expected: 1 test passes, typecheck is clean, and `next build` succeeds.

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "chore: scaffold Next.js app with Evolved FINCLUST tokens"
```

---

### Task 2: Currency registry, formatting and money parsing

**Files:** Create `src/domain/money/currency.ts` and `src/domain/money/currency.test.ts`. Delete `src/domain/smoke.test.ts`.

**Interfaces:** Produces:
```ts
type CurrencyCode = "INR" | "USD";
const CURRENCIES: Record<CurrencyCode, { code; locale; words: { system: "indian" | "international"; major: string; minor: string } }>;
const CURRENCY_CODES: [CurrencyCode, ...CurrencyCode[]];
function formatMoney(minor: number, currency: CurrencyCode): string;   // "₹3,38,683.60"
function formatAmount(minor: number, currency: CurrencyCode): string;  // "3,38,683.60"
function parseMoney(input: string): number | null;                     // minor units
```

- [ ] **Step 1: Write the failing test**

`src/domain/money/currency.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { formatAmount, formatMoney, parseMoney } from "./currency";

describe("formatMoney", () => {
  it("uses Indian lakh grouping for INR", () => {
    expect(formatMoney(33868360, "INR")).toBe("₹3,38,683.60");
  });
  it("uses western grouping for USD", () => {
    expect(formatMoney(132600, "USD")).toBe("$1,326.00");
  });
});

describe("formatAmount", () => {
  it("omits the symbol but keeps grouping and 2 decimals", () => {
    expect(formatAmount(33868360, "INR")).toBe("3,38,683.60");
    expect(formatAmount(7500000, "INR")).toBe("75,000.00");
    expect(formatAmount(21100, "USD")).toBe("211.00");
  });
});

describe("parseMoney", () => {
  it.each([
    ["37500", 3750000],
    ["37,500.", 3750000],
    ["25,00.00", 250000],
    ["3,38,683.60", 33868360],
    ["₹ 3,38,683.6", 33868360],
    ["$1,326.00", 132600],
    ["0.29", 29],
    ["  211 ", 21100],
  ])("parses %j", (input, minor) => {
    expect(parseMoney(input)).toBe(minor);
  });

  it.each(["", "abc", "1.234", "-5", "1.2.3", "."])("rejects %j", (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/domain/money/currency.test.ts`
Expected: FAIL, "Cannot find module './currency'".

- [ ] **Step 3: Implement**

`src/domain/money/currency.ts`
```ts
export type CurrencyCode = "INR" | "USD";

interface CurrencyInfo {
  code: CurrencyCode;
  locale: string;
  words: { system: "indian" | "international"; major: string; minor: string };
}

/** Adding a currency = adding one entry here (and to CurrencyCode). */
export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  INR: { code: "INR", locale: "en-IN", words: { system: "indian", major: "Rupees", minor: "Paise" } },
  USD: { code: "USD", locale: "en-US", words: { system: "international", major: "US Dollars", minor: "Cents" } },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as [CurrencyCode, ...CurrencyCode[]];

export function formatMoney(minor: number, currency: CurrencyCode): string {
  const { locale, code } = CURRENCIES[currency];
  return new Intl.NumberFormat(locale, { style: "currency", currency: code }).format(minor / 100);
}

export function formatAmount(minor: number, currency: CurrencyCode): string {
  return new Intl.NumberFormat(CURRENCIES[currency].locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/**
 * Parses what people actually type ("25,00.00", "37,500.", "₹ 3,38,683.6") into
 * minor units. Parsed as a string, never through a float, so the result is
 * exact. Anything ambiguous returns null rather than a guess.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[\s,₹$]/g, "");
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number((match[2] ?? "").padEnd(2, "0"));
  return major * 100 + minor;
}
```

- [ ] **Step 4: Run the tests and confirm they pass, then delete the smoke test**

Run: `rm src/domain/smoke.test.ts && pnpm vitest run src/domain/money`
Expected: all tests pass. If Node lacks full ICU, the INR grouping will fail. Node 22 ships full ICU by default.

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat(domain): currency registry, money formatting and parsing"
```

---

### Task 3: Amount in words (Indian + international)

**Files:** Create `src/domain/money/words.ts` and `src/domain/money/words.test.ts`.

**Interfaces:**
- Consumes `CURRENCIES` and `CurrencyCode` from Task 2.
- Produces `integerToWords(n: number, system: "indian" | "international"): string` and `amountInWords(minor: number, currency: CurrencyCode): string`.

- [ ] **Step 1: Write the failing test**

`src/domain/money/words.test.ts`
```ts
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
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/domain/money/words.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/domain/money/words.ts`
```ts
import { CURRENCIES, type CurrencyCode } from "./currency";

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const SCALES = {
  indian: [[10_000_000, "Crore"], [100_000, "Lakh"], [1_000, "Thousand"]],
  international: [[1_000_000_000, "Billion"], [1_000_000, "Million"], [1_000, "Thousand"]],
} as const;

function below1000(n: number): string {
  const words: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) words.push(`${ONES[hundreds]} Hundred`);
  if (rest >= 20) words.push(TENS[Math.floor(rest / 10)]! + (rest % 10 ? ` ${ONES[rest % 10]}` : ""));
  else if (rest) words.push(ONES[rest]!);
  return words.join(" ");
}

export function integerToWords(n: number, system: "indian" | "international"): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  let remaining = n;
  for (const [value, name] of SCALES[system]) {
    const count = Math.floor(remaining / value);
    if (count) {
      // Recurse: the top scale can exceed 999 (e.g. 150 Crore).
      parts.push(`${integerToWords(count, system)} ${name}`);
      remaining %= value;
    }
  }
  if (remaining) parts.push(below1000(remaining));
  return parts.join(" ");
}

export function amountInWords(minor: number, currency: CurrencyCode): string {
  const { system, major, minor: minorName } = CURRENCIES[currency].words;
  const whole = Math.floor(minor / 100);
  const fraction = minor % 100;
  const fractionWords = fraction ? ` and ${integerToWords(fraction, system)} ${minorName}` : "";
  return `${major} ${integerToWords(whole, system)}${fractionWords} Only`;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm vitest run src/domain/money`. Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat(domain): amount in words with lakh/crore and million systems"
```

---

### Task 4: `calculateInvoice`, the core deep module

**Files:** Create `src/domain/invoice/calculate.ts` and `src/domain/invoice/calculate.test.ts`.

**Interfaces:**
- Consumes `CurrencyCode` (Task 2) and `amountInWords` (Task 3).
- Produces:
```ts
interface CalcLine { description: string; qty: number; rateMinor: number; hsnSac?: string | null }
interface TaxContext { currency: CurrencyCode; gstEnabled: boolean; taxRateBp: number; sellerStateCode: string; placeOfSupplyStateCode: string | null }
type TaxRegime = "intra" | "inter" | "export" | "none";
interface TaxLine { label: "CGST" | "SGST" | "IGST"; rateBp: number; amountMinor: number }
interface CalculatedInvoice<L extends CalcLine> {
  lines: (L & { amountMinor: number })[]; subtotalMinor: number; regime: TaxRegime;
  taxes: TaxLine[]; taxMinor: number; totalMinor: number; totalInWords: string;
}
function taxRegime(ctx: TaxContext): TaxRegime;
function lineAmount(qty: number, rateMinor: number): number;
function calculateInvoice<L extends CalcLine>(lines: L[], ctx: TaxContext): CalculatedInvoice<L>;
```

- [ ] **Step 1: Write the failing test**

`src/domain/invoice/calculate.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { calculateInvoice, lineAmount, taxRegime, type TaxContext } from "./calculate";

const KA = "29"; // FINCLUST, Karnataka
const inr = (overrides: Partial<TaxContext> = {}): TaxContext => ({
  currency: "INR", gstEnabled: true, taxRateBp: 1800, sellerStateCode: KA, placeOfSupplyStateCode: "33", ...overrides,
});
const line = (rupees: number, qty = 1) => ({ description: "x", qty, rateMinor: rupees * 100 });

describe("calculateInvoice: the real sample invoices", () => {
  it("INV2608002 (ALSUM, Tamil Nadu): IGST 18%, matching the balance on the Google Doc", () => {
    const result = calculateInvoice(
      [37500, 25000, 70000, 75000, 41130, 38390].map((r) => line(r)),
      inr({ placeOfSupplyStateCode: "33" }),
    );
    expect(result.subtotalMinor).toBe(28702000);
    expect(result.regime).toBe("inter");
    expect(result.taxes).toEqual([{ label: "IGST", rateBp: 1800, amountMinor: 5166360 }]);
    expect(result.totalMinor).toBe(33868360);
    expect(result.totalInWords).toBe(
      "Rupees Three Lakh Thirty Eight Thousand Six Hundred Eighty Three and Sixty Paise Only",
    );
  });

  it("INV2608001 (Technophile, USA): export under LUT, no tax", () => {
    const result = calculateInvoice([line(211), line(315), line(800)], {
      currency: "USD", gstEnabled: true, taxRateBp: 1800, sellerStateCode: KA, placeOfSupplyStateCode: null,
    });
    expect(result.regime).toBe("export");
    expect(result.taxes).toEqual([]);
    expect(result.totalMinor).toBe(132600);
  });
});

describe("tax regime", () => {
  it("same state → CGST + SGST at half rate each", () => {
    const result = calculateInvoice([line(1000)], inr({ placeOfSupplyStateCode: KA }));
    expect(result.taxes).toEqual([
      { label: "CGST", rateBp: 900, amountMinor: 9000 },
      { label: "SGST", rateBp: 900, amountMinor: 9000 },
    ]);
    expect(result.totalMinor).toBe(118000);
  });

  it("unregistered Indian customer still follows place of supply", () => {
    // No GSTIN is involved at all: only the state code matters.
    expect(taxRegime(inr({ placeOfSupplyStateCode: "27" }))).toBe("inter");
  });

  it("GST switched off → none", () => {
    const result = calculateInvoice([line(1000)], inr({ gstEnabled: false }));
    expect(result.regime).toBe("none");
    expect(result.totalMinor).toBe(100000);
  });

  it("export wins even if GST is on", () => {
    expect(taxRegime(inr({ placeOfSupplyStateCode: null }))).toBe("export");
  });

  it("respects a custom rate", () => {
    const result = calculateInvoice([line(1000)], inr({ taxRateBp: 500 }));
    expect(result.taxes).toEqual([{ label: "IGST", rateBp: 500, amountMinor: 5000 }]);
  });
});

describe("rounding", () => {
  it("rounds each line once, half away from zero", () => {
    expect(lineAmount(1.5, 33333)).toBe(50000); // 49999.5 → 50000
    expect(lineAmount(0.1, 30000)).toBe(3000); // no float drift
    expect(lineAmount(2.345, 100)).toBe(235); // 234.5 → 235
  });

  it("empty invoice totals zero", () => {
    const result = calculateInvoice([], inr());
    expect(result.totalMinor).toBe(0);
    expect(result.totalInWords).toBe("Rupees Zero Only");
  });

  it("keeps extra line fields (ids) on the output", () => {
    const result = calculateInvoice([{ id: "a", description: "x", qty: 2, rateMinor: 150 }], inr());
    expect(result.lines[0]).toMatchObject({ id: "a", amountMinor: 300 });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/domain/invoice/calculate.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/domain/invoice/calculate.ts`
```ts
import type { CurrencyCode } from "../money/currency";
import { amountInWords } from "../money/words";

export interface CalcLine {
  description: string;
  qty: number;
  rateMinor: number;
  hsnSac?: string | null;
}

export interface TaxContext {
  currency: CurrencyCode;
  gstEnabled: boolean;
  /** Basis points: 1800 = 18%. */
  taxRateBp: number;
  sellerStateCode: string;
  /** Customer's GST state code; null = outside India (export under LUT). */
  placeOfSupplyStateCode: string | null;
}

export type TaxRegime = "intra" | "inter" | "export" | "none";

export interface TaxLine {
  label: "CGST" | "SGST" | "IGST";
  rateBp: number;
  amountMinor: number;
}

export interface CalculatedInvoice<L extends CalcLine> {
  lines: (L & { amountMinor: number })[];
  subtotalMinor: number;
  regime: TaxRegime;
  taxes: TaxLine[];
  taxMinor: number;
  totalMinor: number;
  totalInWords: string;
}

export function taxRegime(ctx: TaxContext): TaxRegime {
  if (ctx.placeOfSupplyStateCode === null) return "export";
  if (!ctx.gstEnabled) return "none";
  return ctx.placeOfSupplyStateCode === ctx.sellerStateCode ? "intra" : "inter";
}

/** Qty is scaled to thousandths first so float noise never reaches the rounding. */
export function lineAmount(qty: number, rateMinor: number): number {
  const qtyMilli = Math.round(qty * 1000);
  return Math.round((qtyMilli * rateMinor) / 1000);
}

const pct = (amount: number, bp: number) => Math.round((amount * bp) / 10_000);

function taxesFor(regime: TaxRegime, subtotal: number, rateBp: number): TaxLine[] {
  if (regime === "inter") return [{ label: "IGST", rateBp, amountMinor: pct(subtotal, rateBp) }];
  if (regime === "intra") {
    const half = rateBp / 2;
    return [
      { label: "CGST", rateBp: half, amountMinor: pct(subtotal, half) },
      { label: "SGST", rateBp: half, amountMinor: pct(subtotal, half) },
    ];
  }
  return [];
}

/**
 * The only place invoice arithmetic happens. The editor, the PDF, the CSV
 * export and the stored totals all call this, so they cannot disagree.
 */
export function calculateInvoice<L extends CalcLine>(lines: L[], ctx: TaxContext): CalculatedInvoice<L> {
  const priced = lines.map((l) => ({ ...l, amountMinor: lineAmount(l.qty, l.rateMinor) }));
  const subtotalMinor = priced.reduce((sum, l) => sum + l.amountMinor, 0);
  const regime = taxRegime(ctx);
  const taxes = taxesFor(regime, subtotalMinor, ctx.taxRateBp);
  const taxMinor = taxes.reduce((sum, t) => sum + t.amountMinor, 0);
  const totalMinor = subtotalMinor + taxMinor;
  return {
    lines: priced,
    subtotalMinor,
    regime,
    taxes,
    taxMinor,
    totalMinor,
    totalInWords: amountInWords(totalMinor, ctx.currency),
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm vitest run src/domain`. Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat(domain): calculateInvoice with GST regime, tax split and rounding"
```

---

### Task 5: Numbering and status

**Files:** Create `src/domain/invoice/numbering.ts`, `numbering.test.ts`, `status.ts` and `status.test.ts`.

**Interfaces:** Produces:
```ts
function periodOf(isoDate: string): string;                        // "2026-08-01" → "2608"
function formatInvoiceNumber(period: string, seq: number): string; // ("2608", 2) → "INV2608002"
type InvoiceState = "DRAFT" | "ISSUED" | "CANCELLED";
type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";
function deriveStatus(inv: { state: InvoiceState; totalMinor: number; paidMinor: number; dueDate: string | null }, today: string): InvoiceStatus;
```

- [ ] **Step 1: Write the failing tests**

`src/domain/invoice/numbering.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { formatInvoiceNumber, periodOf } from "./numbering";

describe("numbering", () => {
  it("period is YYMM of the invoice date", () => {
    expect(periodOf("2026-08-01")).toBe("2608");
    expect(periodOf("2026-09-30")).toBe("2609");
  });
  it("formats with a 3-digit counter", () => {
    expect(formatInvoiceNumber("2608", 2)).toBe("INV2608002");
    expect(formatInvoiceNumber("2609", 1)).toBe("INV2609001");
    expect(formatInvoiceNumber("2609", 1000)).toBe("INV26091000");
  });
  it("rejects malformed input", () => {
    expect(() => periodOf("01/08/2026")).toThrow();
    expect(() => formatInvoiceNumber("2608", 0)).toThrow();
  });
});
```

`src/domain/invoice/status.test.ts`
```ts
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm vitest run src/domain/invoice`. Expected: FAIL for numbering and status (module not found).

- [ ] **Step 3: Implement**

`src/domain/invoice/numbering.ts`
```ts
/** Period is YYMM of the invoice date. Dates are ISO strings to avoid timezone drift. */
export function periodOf(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(isoDate);
  if (!match) throw new Error(`Invalid ISO date: ${isoDate}`);
  return match[1]!.slice(2) + match[2]!;
}

export function formatInvoiceNumber(period: string, seq: number): string {
  if (!/^\d{4}$/.test(period)) throw new Error(`Invalid period: ${period}`);
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`Invalid sequence: ${seq}`);
  return `INV${period}${String(seq).padStart(3, "0")}`;
}
```

`src/domain/invoice/status.ts`
```ts
export type InvoiceState = "DRAFT" | "ISSUED" | "CANCELLED";
export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";

/** Status is derived, never stored, so it can't go stale when a due date passes. */
export function deriveStatus(
  inv: { state: InvoiceState; totalMinor: number; paidMinor: number; dueDate: string | null },
  today: string,
): InvoiceStatus {
  if (inv.state === "CANCELLED") return "cancelled";
  if (inv.state === "DRAFT") return "draft";
  if (inv.paidMinor >= inv.totalMinor) return "paid";
  if (inv.dueDate !== null && today > inv.dueDate) return "overdue";
  return inv.paidMinor > 0 ? "partial" : "sent";
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm vitest run src/domain`. Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat(domain): invoice numbering and derived status"
```

---

### Task 6: Draft schema, issue validation and GSTIN helpers

**Files:** Create `src/domain/invoice/schema.ts` and `schema.test.ts`. Modify `package.json` (zod is already present).

**Interfaces:**
- Consumes `CURRENCY_CODES` (Task 2).
- Produces:
```ts
const GSTIN_PATTERN: RegExp;
function stateCodeFromGstin(gstin: string): string;
const customerSnapshotSchema; type CustomerSnapshot = { name; addressLines: string[]; gstin: string | null; stateCode: string | null; emails: string[] };
const invoiceLineSchema;      type InvoiceLine = { id; description; hsnSac: string | null; qty: number; rateMinor: number };
const invoiceDraftSchema;     type InvoiceDraft = { companyId; customerId: string | null; customer: CustomerSnapshot; issueDate; dueDate: string | null; paymentTerms: string | null; currency: CurrencyCode; gstEnabled: boolean; taxRateBp: number; template: string; notes: string | null; lines: InvoiceLine[] };
type InvoiceSnapshot = InvoiceDraft & { number: string; companyName: string };
function validateForIssue(draft: InvoiceDraft): string[];  // [] = ready to issue
```

- [ ] **Step 1: Write the failing test**

`src/domain/invoice/schema.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { GSTIN_PATTERN, invoiceDraftSchema, stateCodeFromGstin, validateForIssue, type InvoiceDraft } from "./schema";

export const draft = (overrides: Partial<InvoiceDraft> = {}): InvoiceDraft => ({
  companyId: "00000000-0000-4000-8000-000000000001",
  customerId: null,
  customer: { name: "ALSUM INFOTECH PRIVATE LIMITED", addressLines: ["Chennai"], gstin: "33AAGCA7303P1ZK", stateCode: "33", emails: [] },
  issueDate: "2026-09-01",
  dueDate: "2026-09-15",
  paymentTerms: null,
  currency: "INR",
  gstEnabled: true,
  taxRateBp: 1800,
  template: "classic",
  notes: null,
  lines: [{ id: "l1", description: "Consulting", hsnSac: "998314", qty: 1, rateMinor: 100000 }],
  ...overrides,
});

describe("GSTIN", () => {
  it("accepts the real GSTINs from the samples", () => {
    expect(GSTIN_PATTERN.test("29AAGCF2643D1ZS")).toBe(true);
    expect(GSTIN_PATTERN.test("33AAGCA7303P1ZK")).toBe(true);
    expect(GSTIN_PATTERN.test("29AAGCF2643D1Z")).toBe(false);
  });
  it("reads the state code", () => {
    expect(stateCodeFromGstin("33AAGCA7303P1ZK")).toBe("33");
  });
});

describe("invoiceDraftSchema", () => {
  it("accepts a valid draft", () => {
    expect(invoiceDraftSchema.safeParse(draft()).success).toBe(true);
  });
  it("allows half-filled lines while drafting (autosave must never fail)", () => {
    const d = draft({ lines: [{ id: "l1", description: "", hsnSac: null, qty: 0, rateMinor: 0 }] });
    expect(invoiceDraftSchema.safeParse(d).success).toBe(true);
  });
  it("rejects more than 3 decimals of qty, fractional minor units, and due before issue", () => {
    expect(invoiceDraftSchema.safeParse(draft({ lines: [{ id: "l", description: "x", hsnSac: null, qty: 1.2345, rateMinor: 1 }] })).success).toBe(false);
    expect(invoiceDraftSchema.safeParse(draft({ lines: [{ id: "l", description: "x", hsnSac: null, qty: 1, rateMinor: 1.5 }] })).success).toBe(false);
    expect(invoiceDraftSchema.safeParse(draft({ dueDate: "2026-08-01" })).success).toBe(false);
  });
  it("rejects a malformed GSTIN", () => {
    const d = draft({ customer: { ...draft().customer, gstin: "BAD" } });
    expect(invoiceDraftSchema.safeParse(d).success).toBe(false);
  });
});

describe("validateForIssue", () => {
  it("passes a complete invoice", () => {
    expect(validateForIssue(draft())).toEqual([]);
  });
  it("lists every problem with its line number", () => {
    const problems = validateForIssue(
      draft({
        customer: { ...draft().customer, name: " " },
        lines: [
          { id: "a", description: "ok", hsnSac: null, qty: 1, rateMinor: 100 },
          { id: "b", description: "", hsnSac: null, qty: 0, rateMinor: 100 },
        ],
      }),
    );
    expect(problems).toEqual(["Choose a customer", "Line 2: add a description", "Line 2: quantity must be more than 0"]);
  });
  it("requires at least one line", () => {
    expect(validateForIssue(draft({ lines: [] }))).toEqual(["Add at least one line item"]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/domain/invoice/schema.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/domain/invoice/schema.ts`
```ts
import { z } from "zod";
import { CURRENCY_CODES } from "../money/currency";

export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function stateCodeFromGstin(gstin: string): string {
  return gstin.slice(0, 2);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const threeDecimals = (n: number) => Math.abs(Math.round(n * 1000) - n * 1000) < 1e-6;

export const customerSnapshotSchema = z.object({
  name: z.string().max(200),
  addressLines: z.array(z.string().max(200)).max(6),
  gstin: z.string().regex(GSTIN_PATTERN, "Invalid GSTIN").nullable(),
  /** GST state code of place of supply; null = outside India. */
  stateCode: z.string().regex(/^\d{2}$/).nullable(),
  emails: z.array(z.string().email()).max(10),
});

/** Lenient on purpose: a half-typed row must still autosave. validateForIssue is the strict gate. */
export const invoiceLineSchema = z.object({
  id: z.string().min(1),
  description: z.string().max(500),
  hsnSac: z.string().max(10).nullable(),
  qty: z.number().min(0).max(1_000_000).refine(threeDecimals, "At most 3 decimals"),
  rateMinor: z.number().int().min(0).max(1e13),
});

export const invoiceDraftSchema = z
  .object({
    companyId: z.string().uuid(),
    customerId: z.string().uuid().nullable(),
    customer: customerSnapshotSchema,
    issueDate: isoDate,
    dueDate: isoDate.nullable(),
    paymentTerms: z.string().max(200).nullable(),
    currency: z.enum(CURRENCY_CODES),
    gstEnabled: z.boolean(),
    taxRateBp: z.number().int().min(0).max(10_000),
    template: z.string().min(1),
    notes: z.string().max(2000).nullable(),
    lines: z.array(invoiceLineSchema).max(200),
  })
  .refine((d) => d.dueDate === null || d.dueDate >= d.issueDate, {
    message: "Due date can't be before the invoice date",
    path: ["dueDate"],
  });

export type CustomerSnapshot = z.infer<typeof customerSnapshotSchema>;
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;
export type InvoiceDraft = z.infer<typeof invoiceDraftSchema>;
/** What a version stores: the draft plus what's needed to read it without joins. */
export type InvoiceSnapshot = InvoiceDraft & { number: string; companyName: string };

export function validateForIssue(draft: InvoiceDraft): string[] {
  const problems: string[] = [];
  if (!draft.customer.name.trim()) problems.push("Choose a customer");
  if (draft.lines.length === 0) problems.push("Add at least one line item");
  draft.lines.forEach((line, i) => {
    if (!line.description.trim()) problems.push(`Line ${i + 1}: add a description`);
    if (line.qty <= 0) problems.push(`Line ${i + 1}: quantity must be more than 0`);
  });
  return problems;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm vitest run src/domain`. Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat(domain): invoice draft schema, issue validation, GSTIN helpers"
```

---

### Task 7: Version diff

**Files:** Create `src/domain/invoice/diff.ts` and `diff.test.ts`.

**Interfaces:**
- Consumes `InvoiceSnapshot` and `InvoiceLine` (Task 6) and `formatAmount` (Task 2).
- Produces `interface Change { label: string; from: string; to: string }` and `function diffSnapshots(before: InvoiceSnapshot, after: InvoiceSnapshot): Change[]`.

- [ ] **Step 1: Write the failing test**

`src/domain/invoice/diff.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { diffSnapshots } from "./diff";
import type { InvoiceSnapshot } from "./schema";

const snap = (overrides: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot => ({
  number: "INV2608002",
  companyName: "FINCLUST PRIVATE LIMITED",
  companyId: "00000000-0000-4000-8000-000000000001",
  customerId: null,
  customer: { name: "ALSUM", addressLines: ["Chennai"], gstin: null, stateCode: "33", emails: [] },
  issueDate: "2026-08-01",
  dueDate: null,
  paymentTerms: null,
  currency: "INR",
  gstEnabled: true,
  taxRateBp: 1800,
  template: "classic",
  notes: null,
  lines: [
    { id: "a", description: "Srinivas (August pay-Apex)", hsnSac: null, qty: 1, rateMinor: 7000000 },
    { id: "b", description: "Ramreddy (August pay-OTBI)", hsnSac: null, qty: 1, rateMinor: 7500000 },
  ],
  ...overrides,
});

describe("diffSnapshots", () => {
  it("identical → no changes", () => {
    expect(diffSnapshots(snap(), snap())).toEqual([]);
  });

  it("describes a rate change in the invoice's own money format", () => {
    const after = snap();
    after.lines = [after.lines[0]!, { ...after.lines[1]!, rateMinor: 7000000 }];
    expect(diffSnapshots(snap(), after)).toEqual([{ label: "Line 2 rate", from: "75,000.00", to: "70,000.00" }]);
  });

  it("describes added and removed lines", () => {
    const after = snap({
      lines: [snap().lines[1]!, { id: "c", description: "Vamshi -OIC", hsnSac: null, qty: 1, rateMinor: 3839000 }],
    });
    expect(diffSnapshots(snap(), after)).toEqual([
      { label: "Line 2 added", from: "", to: "Vamshi -OIC · 1 × 38,390.00" },
      { label: "Line 1 removed", from: "Srinivas (August pay-Apex) · 1 × 70,000.00", to: "" },
    ]);
  });

  it("describes header field changes", () => {
    const after = snap({ issueDate: "2026-08-02", gstEnabled: false, companyName: "Other Co" });
    expect(diffSnapshots(snap(), after)).toEqual([
      { label: "Seller", from: "FINCLUST PRIVATE LIMITED", to: "Other Co" },
      { label: "Invoice date", from: "2026-08-01", to: "2026-08-02" },
      { label: "GST", from: "On @ 18%", to: "Off" },
    ]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/domain/invoice/diff.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/domain/invoice/diff.ts`
```ts
import { formatAmount, type CurrencyCode } from "../money/currency";
import type { InvoiceLine, InvoiceSnapshot } from "./schema";

export interface Change {
  label: string;
  from: string;
  to: string;
}

const dash = (v: string | null) => v ?? "—";
const gst = (s: InvoiceSnapshot) => (s.gstEnabled ? `On @ ${s.taxRateBp / 100}%` : "Off");
const describeLine = (l: InvoiceLine, c: CurrencyCode) => `${l.description} · ${l.qty} × ${formatAmount(l.rateMinor, c)}`;

/**
 * Human-readable changes between two versions. Lines are matched by id, so
 * editing a row reads as "Line 2 rate", not "removed + added".
 * ponytail: pure reordering isn't reported; add a "moved" change if anyone asks.
 */
export function diffSnapshots(before: InvoiceSnapshot, after: InvoiceSnapshot): Change[] {
  const changes: Change[] = [];
  const field = (label: string, from: string, to: string) => {
    if (from !== to) changes.push({ label, from, to });
  };

  field("Seller", before.companyName, after.companyName);
  field("Customer", before.customer.name, after.customer.name);
  field("Bill-to address", before.customer.addressLines.join(", "), after.customer.addressLines.join(", "));
  field("Customer GSTIN", dash(before.customer.gstin), dash(after.customer.gstin));
  field("Invoice date", before.issueDate, after.issueDate);
  field("Due date", dash(before.dueDate), dash(after.dueDate));
  field("Payment terms", dash(before.paymentTerms), dash(after.paymentTerms));
  field("Currency", before.currency, after.currency);
  field("GST", gst(before), gst(after));
  field("Template", before.template, after.template);
  field("Notes", dash(before.notes), dash(after.notes));

  const remaining = new Map(before.lines.map((line, index) => [line.id, { line, index }]));
  after.lines.forEach((line, i) => {
    const n = `Line ${i + 1}`;
    const old = remaining.get(line.id);
    if (!old) {
      changes.push({ label: `${n} added`, from: "", to: describeLine(line, after.currency) });
      return;
    }
    remaining.delete(line.id);
    field(`${n} description`, old.line.description, line.description);
    field(`${n} HSN/SAC`, dash(old.line.hsnSac), dash(line.hsnSac));
    field(`${n} qty`, String(old.line.qty), String(line.qty));
    field(`${n} rate`, formatAmount(old.line.rateMinor, before.currency), formatAmount(line.rateMinor, after.currency));
  });
  for (const { line, index } of remaining.values()) {
    changes.push({ label: `Line ${index + 1} removed`, from: describeLine(line, before.currency), to: "" });
  }
  return changes;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm vitest run src/domain`. Expected: PASS (the whole domain suite).

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat(domain): human-readable version diff"
```

---

### Task 8: Database schema, client, number allocation and seed

**Files:**
- Create `prisma/schema.prisma`, `prisma/seed.ts`, `src/infra/db.ts`, `src/features/invoices/allocate-number.ts`, `src/features/invoices/allocate-number.int.test.ts` and `.env.example`.
- Modify `package.json` (dependencies and scripts).

**Interfaces:**
- Consumes `periodOf` and `formatInvoiceNumber` (Task 5), `calculateInvoice` (Task 4), and `InvoiceDraft` and `InvoiceSnapshot` (Task 6).
- Produces the Prisma models `User, Company, Customer, CatalogItem, Invoice, InvoiceLine, InvoiceCounter, InvoiceVersion, Payment, PdfArchive, ActivityLog, ShareToken, Setting` and the enums `Role`, `InvoiceState`.
- Produces `db` (the Prisma client singleton) from `@/infra/db`.
- Produces `allocateInvoiceNumber(tx: Prisma.TransactionClient, issueDate: string): Promise<{ period: string; number: string }>`.

- [ ] **Step 1: Add dependencies and scripts**

Run: `pnpm add @prisma/client@^6.19.3 bcryptjs@^2.4.3 jose@^5.9.6 server-only && pnpm add -D prisma@^6.19.3 tsx@^4.19.2 @types/bcryptjs@^2.4.6`

In `package.json`, set `"postinstall": "prisma generate"`, `"build": "prisma generate && next build"`, `"db:migrate": "prisma migrate dev"`, `"db:deploy": "prisma migrate deploy"` and `"db:seed": "node --env-file=.env --import tsx prisma/seed.ts"`.

- [ ] **Step 2: Create `.env.example` and a real `.env`**

`.env.example`
```
# Same Supabase project as the career site, isolated in its own schema.
DATABASE_URL="postgresql://USER:PASS@HOST:6543/postgres?pgbouncer=true&schema=invoicing"
DIRECT_URL="postgresql://USER:PASS@HOST:5432/postgres?schema=invoicing"
# Optional: enables the concurrency integration test. Separate schema, never production data.
TEST_DATABASE_URL="postgresql://USER:PASS@HOST:5432/postgres?schema=invoicing_test"
JWT_SECRET="at-least-32-random-characters"
SESSION_TTL_HOURS=12
SEED_ADMIN_EMAIL="admin@finclust.ai"
SEED_ADMIN_PASSWORD="change-me"
```

Build `.env`:
- Copy `DATABASE_URL` and `DIRECT_URL` from `E:\sudheer\.env`, appending `&schema=invoicing` (or `?schema=invoicing` if there is no query string).
- Set `TEST_DATABASE_URL` to the `DIRECT_URL` value with `schema=invoicing_test`.
- Generate `JWT_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
- Ask the user for `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`.

- [ ] **Step 3: Write the Prisma schema**

`prisma/schema.prisma`
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum Role {
  ADMIN
  ACCOUNTANT
  VIEWER
}

enum InvoiceState {
  DRAFT
  ISSUED
  CANCELLED
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  name         String
  passwordHash String   @map("password_hash")
  role         Role     @default(ACCOUNTANT)
  isActive     Boolean  @default(true) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at")

  @@map("users")
}

model Company {
  id              String    @id @default(uuid()) @db.Uuid
  name            String
  addressLines    String[]  @map("address_lines")
  email           String?
  phone           String?
  gstin           String?
  stateCode       String    @map("state_code")
  lut             String?
  bankName        String?   @map("bank_name")
  bankAccount     String?   @map("bank_account")
  bankIfsc        String?   @map("bank_ifsc")
  bankBranch      String?   @map("bank_branch")
  logoPath        String?   @map("logo_path")
  signaturePath   String?   @map("signature_path")
  defaultTemplate String    @default("classic") @map("default_template")
  isArchived      Boolean   @default(false) @map("is_archived")
  createdAt       DateTime  @default(now()) @map("created_at")
  invoices        Invoice[]

  @@map("companies")
}

model Customer {
  id           String    @id @default(uuid()) @db.Uuid
  name         String
  addressLines String[]  @map("address_lines")
  gstin        String?
  /// GST state code of place of supply; null = outside India.
  stateCode    String?   @map("state_code")
  emails       String[]
  phone        String?
  currency     String    @default("INR")
  notes        String?
  isArchived   Boolean   @default(false) @map("is_archived")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")
  invoices     Invoice[]

  @@index([name])
  @@map("customers")
}

model CatalogItem {
  id          String   @id @default(uuid()) @db.Uuid
  description String
  hsnSac      String?  @map("hsn_sac")
  rateMinor   BigInt   @map("rate_minor")
  currency    String   @default("INR")
  isArchived  Boolean  @default(false) @map("is_archived")
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("catalog_items")
}

model Invoice {
  id               String           @id @default(uuid()) @db.Uuid
  number           String           @unique
  period           String
  companyId        String           @map("company_id") @db.Uuid
  company          Company          @relation(fields: [companyId], references: [id])
  customerId       String?          @map("customer_id") @db.Uuid
  customer         Customer?        @relation(fields: [customerId], references: [id])
  /// Bill-to as printed; frozen so editing the customer later never rewrites history.
  customerSnapshot Json             @map("customer_snapshot")
  issueDate        DateTime         @map("issue_date") @db.Date
  dueDate          DateTime?        @map("due_date") @db.Date
  paymentTerms     String?          @map("payment_terms")
  currency         String
  template         String           @default("classic")
  gstEnabled       Boolean          @default(true) @map("gst_enabled")
  taxRateBp        Int              @default(1800) @map("tax_rate_bp")
  notes            String?
  state            InvoiceState     @default(DRAFT)
  subtotalMinor    BigInt           @default(0) @map("subtotal_minor")
  taxMinor         BigInt           @default(0) @map("tax_minor")
  totalMinor       BigInt           @default(0) @map("total_minor")
  paidMinor        BigInt           @default(0) @map("paid_minor")
  version          Int              @default(1)
  createdById      String?          @map("created_by_id") @db.Uuid
  createdAt        DateTime         @default(now()) @map("created_at")
  updatedAt        DateTime         @updatedAt @map("updated_at")
  lines            InvoiceLine[]
  versions         InvoiceVersion[]
  payments         Payment[]
  archives         PdfArchive[]

  @@index([period])
  @@index([customerId])
  @@index([issueDate])
  @@map("invoices")
}

model InvoiceLine {
  id          String  @id @db.Uuid
  invoiceId   String  @map("invoice_id") @db.Uuid
  invoice     Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  position    Int
  description String
  hsnSac      String? @map("hsn_sac")
  qtyMilli    Int     @map("qty_milli")
  rateMinor   BigInt  @map("rate_minor")
  amountMinor BigInt  @map("amount_minor")

  @@index([invoiceId, position])
  @@map("invoice_lines")
}

model InvoiceCounter {
  period String @id
  last   Int

  @@map("invoice_counters")
}

model InvoiceVersion {
  id        String   @id @default(uuid()) @db.Uuid
  invoiceId String   @map("invoice_id") @db.Uuid
  invoice   Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  version   Int
  snapshot  Json
  reason    String
  userId    String?  @map("user_id") @db.Uuid
  createdAt DateTime @default(now()) @map("created_at")

  @@unique([invoiceId, version])
  @@map("invoice_versions")
}

model Payment {
  id          String   @id @default(uuid()) @db.Uuid
  invoiceId   String   @map("invoice_id") @db.Uuid
  invoice     Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  date        DateTime @db.Date
  amountMinor BigInt   @map("amount_minor")
  method      String
  reference   String?
  createdById String?  @map("created_by_id") @db.Uuid
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("payments")
}

model PdfArchive {
  id          String       @id @default(uuid()) @db.Uuid
  invoiceId   String       @map("invoice_id") @db.Uuid
  invoice     Invoice      @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  version     Int
  storagePath String       @map("storage_path")
  purpose     String
  sha256      String
  createdById String?      @map("created_by_id") @db.Uuid
  createdAt   DateTime     @default(now()) @map("created_at")
  shareTokens ShareToken[]

  @@map("pdf_archive")
}

model ActivityLog {
  id       BigInt   @id @default(autoincrement())
  actorId  String?  @map("actor_id") @db.Uuid
  entity   String
  entityId String   @map("entity_id")
  action   String
  meta     Json?
  at       DateTime @default(now())

  @@index([entity, entityId, at])
  @@index([action, entityId, at])
  @@map("activity_log")
}

model ShareToken {
  token     String     @id
  archiveId String     @map("archive_id") @db.Uuid
  archive   PdfArchive @relation(fields: [archiveId], references: [id], onDelete: Cascade)
  openCount Int        @default(0) @map("open_count")
  revokedAt DateTime?  @map("revoked_at")
  createdAt DateTime   @default(now()) @map("created_at")

  @@map("share_tokens")
}

model Setting {
  key   String @id
  value Json

  @@map("settings")
}
```

- [ ] **Step 4: Migrate the main and test schemas**

Run: `pnpm prisma migrate dev --name init`
Expected: creates the `invoicing` schema and all tables, and generates the client.

Run (bash): `DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL" pnpm prisma migrate deploy` (load the value from `.env` first: `set -a; . ./.env; set +a`).
Expected: the `invoicing_test` schema is created.

- [ ] **Step 5: Write the DB client**

`src/infra/db.ts`
```ts
import { Prisma, PrismaClient } from "@prisma/client";

// Ported from E:\sudheer\packages\db\src\index.ts. P1001 ("can't reach database
// server") means the query never left the client, so a blind retry cannot
// duplicate a write. P1017 (closed mid-flight) is deliberately not retried.
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [150, 500];

function isRetryable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code === "P1001";
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return error.errorCode === "P1001" || error.message.toLowerCase().includes("can't reach database server");
  }
  return false;
}

function createClient() {
  return new PrismaClient({ log: ["warn", "error"] }).$extends({
    query: {
      async $allOperations({ args, query }) {
        for (let attempt = 1; ; attempt++) {
          try {
            return await query(args);
          } catch (error) {
            if (!isRetryable(error) || attempt === MAX_ATTEMPTS) throw error;
            await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
          }
        }
      },
    },
  });
}

type Db = ReturnType<typeof createClient>;

// Serverless reuses the module between invocations; one client per instance.
const globalForDb = globalThis as unknown as { db?: Db };
export const db = globalForDb.db ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.db = db;
```

- [ ] **Step 6: Write the failing integration test for number allocation**

`src/features/invoices/allocate-number.int.test.ts`
```ts
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { allocateInvoiceNumber } from "./allocate-number";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("allocateInvoiceNumber (needs TEST_DATABASE_URL)", () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const PERIOD = "9901"; // January 2099: never collides with real data

  afterAll(async () => {
    await prisma.invoiceCounter.deleteMany({ where: { period: PERIOD } });
    await prisma.$disconnect();
  });

  it("gives 10 concurrent callers 10 distinct consecutive numbers", async () => {
    await prisma.invoiceCounter.deleteMany({ where: { period: PERIOD } });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => prisma.$transaction((tx) => allocateInvoiceNumber(tx, "2099-01-15"))),
    );
    const numbers = results.map((r) => r.number).sort();
    expect(numbers).toEqual(Array.from({ length: 10 }, (_, i) => `INV9901${String(i + 1).padStart(3, "0")}`));
  });

  it("starts a new month at 001", async () => {
    await prisma.invoiceCounter.deleteMany({ where: { period: PERIOD } });
    const first = await prisma.$transaction((tx) => allocateInvoiceNumber(tx, "2099-01-01"));
    expect(first).toEqual({ period: PERIOD, number: "INV9901001" });
  });
});
```

This file matches `src/**/*.test.ts`, so `pnpm test` runs it, and `describe.skipIf` skips it when `TEST_DATABASE_URL` is unset. `vitest.config.ts` already loads `.env` through `process.loadEnvFile`, so no extra script is needed and `test:int` from Step 1 can be dropped.

Run: `pnpm test src/features/invoices`
Expected: FAIL, "Cannot find module './allocate-number'".

- [ ] **Step 7: Implement the allocation**

`src/features/invoices/allocate-number.ts`
```ts
import type { Prisma } from "@prisma/client";
import { formatInvoiceNumber, periodOf } from "@/domain/invoice/numbering";

/**
 * Must run inside the transaction that creates the invoice, so a failed
 * create rolls the counter back and the series has no gaps.
 * Prisma turns this upsert into a single INSERT … ON CONFLICT DO UPDATE
 * (single unique key, no nested writes), which is atomic under concurrency.
 */
export async function allocateInvoiceNumber(
  tx: Prisma.TransactionClient,
  issueDate: string,
): Promise<{ period: string; number: string }> {
  const period = periodOf(issueDate);
  const counter = await tx.invoiceCounter.upsert({
    where: { period },
    create: { period, last: 1 },
    update: { last: { increment: 1 } },
  });
  return { period, number: formatInvoiceNumber(period, counter.last) };
}
```

Run: `pnpm test src/features/invoices`
Expected: PASS (2 tests). If they fail with duplicates, Prisma did not use a native upsert. Replace the body with `tx.$queryRaw` `INSERT INTO invoice_counters (period, last) VALUES (${period}, 1) ON CONFLICT (period) DO UPDATE SET last = invoice_counters.last + 1 RETURNING last` and re-run.

- [ ] **Step 8: Write the seed (FINCLUST, 2 customers, admin, the 2 real invoices)**

`prisma/seed.ts`
```ts
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateInvoice } from "../src/domain/invoice/calculate";
import type { InvoiceSnapshot } from "../src/domain/invoice/schema";

const prisma = new PrismaClient();

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main() {
  const email = required("SEED_ADMIN_EMAIL").toLowerCase();
  const admin = await prisma.user.upsert({
    where: { email },
    create: { email, name: "Admin", role: "ADMIN", passwordHash: await bcrypt.hash(required("SEED_ADMIN_PASSWORD"), 10) },
    update: {},
  });

  if (await prisma.company.count()) {
    console.log("Already seeded; admin ensured.");
    return;
  }

  const company = await prisma.company.create({
    data: {
      name: "FINCLUST PRIVATE LIMITED",
      addressLines: ["13117, Floor-11, Wing-13, Sobha Dream Acres, Phase-1", "Bangalore - 560087, Karnataka"],
      email: "hr@finclust.ai",
      gstin: "29AAGCF2643D1ZS",
      stateCode: "29",
      lut: "AD290625019128X",
      bankName: "IndusInd Bank Limited",
      bankAccount: "257353000123",
      bankIfsc: "INDB0001454",
      bankBranch: "Kundalahalli Branch",
    },
  });

  const technophile = await prisma.customer.create({
    data: {
      name: "Technophile LLC",
      addressLines: ["300, Colonial Center Pkwy, Suite 100", "Roswell, GA 30076, USA"],
      emails: ["ap@technophilellc.com"],
      stateCode: null,
      currency: "USD",
    },
  });
  const alsum = await prisma.customer.create({
    data: {
      name: "ALSUM INFOTECH PRIVATE LIMITED",
      addressLines: ["25/12, Alagiri Street, MGR Nagar", "Chennai - 600078, Tamil Nadu"],
      gstin: "33AAGCA7303P1ZK",
      stateCode: "33",
      emails: ["hr@alsuminfotech.com"],
      currency: "INR",
    },
  });

  const invoices: InvoiceSnapshot[] = [
    {
      number: "INV2608001", companyName: company.name, companyId: company.id, customerId: technophile.id,
      customer: { name: technophile.name, addressLines: technophile.addressLines, gstin: null, stateCode: null, emails: technophile.emails },
      issueDate: "2026-08-01", dueDate: null, paymentTerms: null, currency: "USD", gstEnabled: false, taxRateBp: 1800,
      template: "classic", notes: null,
      lines: [
        ["EPM planning Demo", 21100],
        ["Mulesoft training (50% paid on Aug-7)", 31500],
        ["Cook Medical (other)", 80000],
      ].map(([description, rateMinor]) => ({ id: randomUUID(), description: String(description), hsnSac: null, qty: 1, rateMinor: Number(rateMinor) })),
    },
    {
      number: "INV2608002", companyName: company.name, companyId: company.id, customerId: alsum.id,
      customer: { name: alsum.name, addressLines: alsum.addressLines, gstin: alsum.gstin, stateCode: "33", emails: alsum.emails },
      issueDate: "2026-08-01", dueDate: null, paymentTerms: null, currency: "INR", gstEnabled: true, taxRateBp: 1800,
      template: "classic", notes: null,
      lines: [
        ["Ramreddy Caratlane project (Paid on Aug-7, for 15 days of July - OTBI)", 3750000],
        ["Srinivas Caratlane project (Paid on Aug-7, for 15 days of July - Apex)", 2500000],
        ["Srinivas Caratlane project (August pay - Apex)", 7000000],
        ["Ramreddy Caratlane project (August pay - OTBI)", 7500000],
        ["Anil Singh - OTBI (August pay)", 4113000],
        ["Vamshi - OIC (August pay)", 3839000],
      ].map(([description, rateMinor]) => ({ id: randomUUID(), description: String(description), hsnSac: null, qty: 1, rateMinor: Number(rateMinor) })),
    },
  ];

  for (const snap of invoices) {
    const calc = calculateInvoice(snap.lines, {
      currency: snap.currency, gstEnabled: snap.gstEnabled, taxRateBp: snap.taxRateBp,
      sellerStateCode: company.stateCode, placeOfSupplyStateCode: snap.customer.stateCode,
    });
    await prisma.invoice.create({
      data: {
        number: snap.number, period: "2608", companyId: company.id, customerId: snap.customerId,
        customerSnapshot: snap.customer, issueDate: new Date(snap.issueDate), currency: snap.currency,
        gstEnabled: snap.gstEnabled, taxRateBp: snap.taxRateBp, state: "ISSUED",
        subtotalMinor: calc.subtotalMinor, taxMinor: calc.taxMinor, totalMinor: calc.totalMinor,
        createdById: admin.id,
        lines: {
          create: calc.lines.map((l, position) => ({
            id: l.id, position, description: l.description, hsnSac: l.hsnSac,
            qtyMilli: Math.round(l.qty * 1000), rateMinor: l.rateMinor, amountMinor: l.amountMinor,
          })),
        },
        versions: { create: { version: 1, snapshot: snap, reason: "Imported from Google Docs", userId: admin.id } },
      },
    });
  }
  await prisma.invoiceCounter.create({ data: { period: "2608", last: 2 } });
  console.log("Seeded FINCLUST, 2 customers, 2 invoices.");
}

main().finally(() => prisma.$disconnect());
```

Run: `pnpm db:seed`
Expected: "Seeded FINCLUST, 2 customers, 2 invoices." Running it again prints "Already seeded; admin ensured."

- [ ] **Step 9: Verify and commit**

Run: `pnpm test && pnpm typecheck`. Expected: everything passes.
```bash
git add -A && git commit -m "feat(db): invoicing schema, atomic invoice numbering, seed with real invoices"
```

---

### Task 9: Login, sessions, roles and the authenticated shell

**Files:**
- Create `src/env.ts`.
- Create `src/features/auth/permissions.ts` and `permissions.test.ts`.
- Create `src/features/auth/session.ts` and `session.test.ts`.
- Create `src/features/auth/password.ts` and `password.test.ts`.
- Create `src/features/auth/current-user.ts` and `src/features/auth/login-action.ts`.
- Create `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/login/login-form.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx` and `src/app/logout/route.ts`.
- Delete `src/app/page.tsx`.

**Interfaces:** Produces:
```ts
type Role = "ADMIN" | "ACCOUNTANT" | "VIEWER";
type Action = "read" | "write" | "send" | "admin";
function can(role: Role, action: Action): boolean;
class AuthError extends Error { reason: "unauthenticated" | "forbidden" }
function authorize<U extends { role: Role }>(user: U | null, action: Action): U;
const SESSION_COOKIE = "invoice_session";
function signSession(s: { userId: string }, secret: string, ttlHours: number): Promise<string>;
function verifySession(token: string, secret: string): Promise<{ userId: string } | null>;
function verifyCredentials(findByEmail: (email: string) => Promise<AuthUserRecord | null>, email: string, password: string): Promise<AuthUserRecord | null>;
interface SessionUser { id: string; email: string; name: string; role: Role }
function getCurrentUser(): Promise<SessionUser | null>;
function requireUser(action?: Action): Promise<SessionUser>;  // every later server action starts with this
```

- [ ] **Step 1: Write the failing tests**

`src/features/auth/permissions.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { AuthError, authorize, can } from "./permissions";

describe("can", () => {
  it.each([
    ["ADMIN", "admin", true],
    ["ADMIN", "write", true],
    ["ACCOUNTANT", "write", true],
    ["ACCOUNTANT", "send", true],
    ["ACCOUNTANT", "admin", false],
    ["VIEWER", "read", true],
    ["VIEWER", "write", false],
    ["VIEWER", "send", false],
  ] as const)("%s may %s → %s", (role, action, allowed) => {
    expect(can(role, action)).toBe(allowed);
  });
});

describe("authorize: server-side gate for direct action calls", () => {
  it("rejects a missing (logged-out or deactivated) user", () => {
    expect(() => authorize(null, "read")).toThrowError(new AuthError("unauthenticated"));
  });
  it("rejects a VIEWER writing", () => {
    expect(() => authorize({ role: "VIEWER" as const }, "write")).toThrowError(new AuthError("forbidden"));
  });
  it("returns the user when allowed", () => {
    const user = { id: "u", role: "ACCOUNTANT" as const };
    expect(authorize(user, "write")).toBe(user);
  });
});
```

`src/features/auth/session.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "./session";

const SECRET = "test-secret-that-is-at-least-32-chars!!";

describe("session", () => {
  it("round-trips the user id", async () => {
    const token = await signSession({ userId: "u1" }, SECRET, 1);
    expect(await verifySession(token, SECRET)).toEqual({ userId: "u1" });
  });
  it("rejects a token signed with another secret", async () => {
    const token = await signSession({ userId: "u1" }, "another-secret-that-is-32-chars-long!", 1);
    expect(await verifySession(token, SECRET)).toBeNull();
  });
  it("rejects an expired token", async () => {
    const token = await signSession({ userId: "u1" }, SECRET, -1);
    expect(await verifySession(token, SECRET)).toBeNull();
  });
  it("rejects garbage", async () => {
    expect(await verifySession("not-a-jwt", SECRET)).toBeNull();
  });
});
```

`src/features/auth/password.test.ts`
```ts
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { verifyCredentials, type AuthUserRecord } from "./password";

const hash = bcrypt.hashSync("right-password", 4);
const users: Record<string, AuthUserRecord> = {
  "a@x.com": { id: "1", email: "a@x.com", name: "A", role: "ACCOUNTANT", passwordHash: hash, isActive: true },
  "off@x.com": { id: "2", email: "off@x.com", name: "Off", role: "ADMIN", passwordHash: hash, isActive: false },
};
const find = async (email: string) => users[email] ?? null;

describe("verifyCredentials", () => {
  it("accepts the right password", async () => {
    expect((await verifyCredentials(find, "a@x.com", "right-password"))?.id).toBe("1");
  });
  it("rejects a wrong password", async () => {
    expect(await verifyCredentials(find, "a@x.com", "nope")).toBeNull();
  });
  it("rejects an unknown email", async () => {
    expect(await verifyCredentials(find, "who@x.com", "right-password")).toBeNull();
  });
  it("rejects a deactivated account even with the right password", async () => {
    expect(await verifyCredentials(find, "off@x.com", "right-password")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test src/features/auth`. Expected: FAIL, modules not found.

- [ ] **Step 3: Implement permissions, session and password**

`src/features/auth/permissions.ts`
```ts
export type Role = "ADMIN" | "ACCOUNTANT" | "VIEWER";
export type Action = "read" | "write" | "send" | "admin";

const ALLOWED: Record<Role, readonly Action[]> = {
  ADMIN: ["read", "write", "send", "admin"],
  ACCOUNTANT: ["read", "write", "send"],
  VIEWER: ["read"],
};

export function can(role: Role, action: Action): boolean {
  return ALLOWED[role].includes(action);
}

export class AuthError extends Error {
  constructor(readonly reason: "unauthenticated" | "forbidden") {
    super(reason);
    this.name = "AuthError";
  }
}

/** Every server action calls this, so middleware is never the only gate. */
export function authorize<U extends { role: Role }>(user: U | null, action: Action): U {
  if (!user) throw new AuthError("unauthenticated");
  if (!can(user.role, action)) throw new AuthError("forbidden");
  return user;
}
```

`src/features/auth/session.ts`
```ts
import { jwtVerify, SignJWT } from "jose";

// Edge-safe (jose only) so middleware can import it.
export const SESSION_COOKIE = "invoice_session";

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(session: { userId: string }, secret: string, ttlHours: number): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + Math.round(ttlHours * 3600))
    .sign(key(secret));
}

export async function verifySession(token: string, secret: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    return payload.sub ? { userId: payload.sub } : null;
  } catch {
    return null;
  }
}
```

`src/features/auth/password.ts`
```ts
import bcrypt from "bcryptjs";
import type { Role } from "./permissions";

export interface AuthUserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  isActive: boolean;
}

// Compared against when no user matches, so an unknown email costs the same time
// as a wrong password; otherwise latency reveals which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("finclust-timing-equaliser", 10);

export async function verifyCredentials(
  findByEmail: (email: string) => Promise<AuthUserRecord | null>,
  email: string,
  password: string,
): Promise<AuthUserRecord | null> {
  const user = await findByEmail(email);
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return null;
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) return null;
  // Checked after the hash, so a deactivated account isn't distinguishable by timing.
  return user.isActive ? user : null;
}
```

Run: `pnpm test src/features/auth`. Expected: PASS.

- [ ] **Step 4: Write the env, current user and middleware**

`src/env.ts`
```ts
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  get jwtSecret() {
    return required("JWT_SECRET");
  },
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  isProduction: process.env.NODE_ENV === "production",
};
```

`src/features/auth/current-user.ts`
```ts
import "server-only";
import { cookies } from "next/headers";
import { env } from "@/env";
import { db } from "@/infra/db";
import { authorize, type Action, type Role } from "./permissions";
import { SESSION_COOKIE, verifySession } from "./session";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** Re-reads the user on every call so deactivation and role changes apply immediately. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await verifySession(token, env.jwtSecret);
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user?.isActive) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function requireUser(action: Action = "read"): Promise<SessionUser> {
  return authorize(await getCurrentUser(), action);
}
```

`src/middleware.ts`
```ts
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/features/auth/session";

// First line of defence only; server actions re-check with requireUser().
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.JWT_SECRET;
  if (token && secret && (await verifySession(token, secret))) return NextResponse.next();
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!login|p/|_next/|favicon.ico).*)"] };
```

- [ ] **Step 5: Write the login action and UI**

`src/features/auth/login-action.ts`
```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { db } from "@/infra/db";
import { verifyCredentials } from "./password";
import { SESSION_COOKIE, signSession } from "./session";

export interface LoginState {
  error?: string;
}

const MAX_FAILURES_PER_MINUTE = 5;

/** Only same-site relative paths; "//evil.com" and "/\evil.com" are open redirects. */
function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const failures = await db.activityLog.count({
    where: { action: "login_failed", entityId: email, at: { gte: new Date(Date.now() - 60_000) } },
  });
  if (failures >= MAX_FAILURES_PER_MINUTE) return { error: "Too many attempts. Wait a minute and try again." };

  const user = await verifyCredentials((e) => db.user.findUnique({ where: { email: e } }), email, password);
  if (!user) {
    await db.activityLog.create({ data: { action: "login_failed", entity: "user", entityId: email } });
    return { error: "Email or password is incorrect." };
  }

  const token = await signSession({ userId: user.id }, env.jwtSecret, env.sessionTtlHours);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: env.sessionTtlHours * 3600,
  });
  await db.activityLog.create({ data: { actorId: user.id, action: "login", entity: "user", entityId: user.id } });
  redirect(safeNext(String(form.get("next") ?? "/")));
}
```

`src/app/login/login-form.tsx`
```tsx
"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/features/auth/login-action";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-body">Email</span>
        <input className="field" type="email" name="email" autoComplete="email" required autoFocus />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-body">Password</span>
        <input className="field" type="password" name="password" autoComplete="current-password" required />
      </label>
      {state.error && (
        <p role="alert" className="rounded-[var(--radius-input)] bg-red-tint px-3 py-2 text-sm text-red">
          {state.error}
        </p>
      )}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
```

`src/app/login/page.tsx`
```tsx
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center bg-sand px-4">
      <div className="card w-full max-w-sm p-8">
        <p className="font-mono text-xs uppercase tracking-widest text-mid">FINCLUST</p>
        <h1 className="mt-1 mb-6 text-2xl">Invoices</h1>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
```

`src/app/logout/route.ts`
```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/features/auth/session";

export async function POST(req: Request) {
  (await cookies()).delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
```

`src/app/(app)/layout.tsx`
```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/current-user";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b border-line bg-paper px-6 py-3">
        <span className="font-extrabold tracking-tight">FINCLUST <span className="text-mid font-semibold">Invoices</span></span>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-body">{user.name}</span>
          <span className="rounded-full bg-sand px-2 py-0.5 font-mono text-xs text-mid">{user.role}</span>
          <form action="/logout" method="post"><button className="btn">Sign out</button></form>
        </div>
      </header>
      {children}
    </div>
  );
}
```

`src/app/(app)/page.tsx`
```tsx
export default function Home() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-3xl">Welcome</h1>
      <p className="mt-2 text-body">The invoice editor arrives in Plan 2.</p>
    </main>
  );
}
```

Run: `rm src/app/page.tsx`

- [ ] **Step 6: Verify end to end**

Run: `pnpm test && pnpm typecheck && pnpm build`. Expected: all green.
Run: `pnpm dev`, then open http://localhost:3100. Expected:
- You are redirected to `/login?next=%2F`.
- A wrong password shows "Email or password is incorrect."
- The sixth wrong attempt within a minute shows the rate-limit message.
- The seeded admin logs in and sees the header with name and ADMIN pill.
- Sign out returns you to `/login`.

- [ ] **Step 7: Commit**
```bash
git add -A && git commit -m "feat(auth): login with roles, sessions, rate limit and authenticated shell"
```

---

## Done when
- `pnpm test` passes the whole domain suite plus the auth tests, and the numbering integration test passes when `TEST_DATABASE_URL` is set.
- `pnpm build` succeeds.
- The seeded admin can log in at :3100.
- The `invoicing` schema in Supabase holds FINCLUST, ALSUM, Technophile and INV2608001/002 with correct totals (₹3,38,683.60 and $1,326.00).
