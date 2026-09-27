# Plan 2: Split Editor + Classic PDF (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Open an invoice, edit it with the form on the left and a live PDF preview on the right, watch totals and tax recalculate as you type, have it autosave, and download the exact PDF you are looking at.

**Architecture:** The editor holds one `InvoiceDraft` in React state. `calculateInvoice()` derives every total on each render, so no total is ever typed or stored in component state. The same `<InvoiceDocument>` component renders the on-screen preview (client, via `usePDF`) and the downloaded file (server, via `renderToBuffer`), which is what makes "what you see is what you send" structurally true rather than a promise. Autosave writes through a server action guarded by the invoice's version column.

**Tech Stack:** `@react-pdf/renderer` ^4.9 (React 19 peer-supported, confirmed), Next 15 server actions, Prisma, vitest.

**Spec:** [docs/superpowers/specs/2026-09-27-invoice-generator-design.md](../specs/2026-09-27-invoice-generator-design.md)
**Builds on:** [Plan 1](2026-09-27-plan-1-foundation-domain.md) — domain core, auth, schema, seed.

## Global Constraints
Plan 1's constraints all still hold. Added here:
- **Money crosses the Prisma boundary exactly once**, through `toMinor`/`fromMinor` in `src/domain/money/bigint.ts`. No `Number(row.totalMinor)` anywhere else. (This is Plan 1's deferred minor #10.)
- **Totals are never stored in component state and never typed by a user.** The only writer of `subtotalMinor`/`taxMinor`/`totalMinor` is the save action, and it gets them from `calculateInvoice`.
- **Light theme only.** No `prefers-color-scheme` block, no dark tokens.
- Generic UI stays as CSS classes in `@layer components` (the career site's convention), not as React wrapper components. Size variants get their own class (`.field-sm`), never `!important` over `.field`.
- Modals and drawers use native `<dialog>` + `showModal()` — the browser gives focus containment, Escape and `inert` for free.
- The PDF uses **Helvetica**, the standard PDF font. Google Docs rendered these invoices in Arial, so Helvetica is faithful to what FINCLUST sends today, and it removes all font-loading machinery.
  `ponytail: standard font, no embedding. Register Hanken Grotesk TTFs in src/pdf/fonts.ts if brand type in the PDF is ever asked for.`
- `@react-pdf/renderer` is imported **only** from `src/pdf/**` and loaded into the editor through `next/dynamic` with `ssr: false`, so its weight lands on the editor route alone.

## Review Focus
1. **Two tabs open on the same invoice.** The second save must not silently discard the first. The version guard should report a conflict, not overwrite.
2. **A rate typed as `1,50,000` or `1500.5` then blurred**, and a qty of `0.333`: the cell must show what was meant, and the stored minor units must match what the PDF prints.
3. **Autosave while the network is down**, and autosave racing a navigation away: the user must be told it did not save, and must not lose the typed line.
4. **An invoice whose customer has since been renamed or deleted:** the PDF must still print the bill-to that was frozen onto the invoice, not the live customer row.
5. **A VIEWER opening the editor:** every field read-only, no autosave fired, and the save action rejected server-side even if called directly.

---

## File Map
```
src/domain/money/bigint.ts            toMinor / fromMinor / toQtyMilli / fromQtyMilli   (+test)
src/features/invoices/mapping.ts      rowToDraft / draftToRow — the only DB<->domain money crossing (+test)
src/features/invoices/queries.ts      loadInvoiceForEditor, listInvoices, listCustomersForPicker
src/features/invoices/actions.ts      createDraftInvoice, saveDraft, issueInvoice   (server actions)
src/pdf/invoice-document.tsx          <InvoiceDocument> — Classic template, shared client+server
src/pdf/render.ts                     renderInvoicePdf(props) -> Buffer   (server only)
src/pdf/props.ts                      InvoiceDocumentProps + buildDocumentProps(draft, company)  (+test)
src/app/(app)/layout.tsx              MODIFY: sidebar nav
src/app/(app)/invoices/page.tsx       invoice list
src/app/(app)/invoices/new/route.ts   POST -> create draft -> redirect to editor
src/app/(app)/invoices/[id]/page.tsx  server: load + authorise, render <InvoiceEditor>
src/app/(app)/invoices/[id]/pdf/route.ts  GET -> renderInvoicePdf -> application/pdf
src/features/invoices/editor/invoice-editor.tsx   client split view, owns the draft
src/features/invoices/editor/line-grid.tsx        spreadsheet-style rows
src/features/invoices/editor/money-input.tsx      raw while focused, formatted when not
src/features/invoices/editor/customer-picker.tsx  native <dialog> search + fill
src/features/invoices/editor/pdf-preview.tsx      dynamic() wrapper around usePDF
src/features/invoices/editor/use-autosave.ts      debounce + version guard + status
src/app/globals.css                   MODIFY: .field-sm .label .hint .error-line .chip .grid-cell .status-*
```

---

### Task 1: The BigInt boundary and row↔draft mapping

Closes Plan 1's deferred minor: Prisma returns `bigint`, the domain takes `number`, and `JSON.stringify` throws on a BigInt — so a server component handing an invoice to a client component needs one conversion, in one place.

**Files:** Create `src/domain/money/bigint.ts`, `bigint.test.ts`, `src/features/invoices/mapping.ts`, `mapping.test.ts`.

**Interfaces:**
```ts
// bigint.ts
function fromMinor(v: bigint): number;     // BigInt column -> domain number, throws past 2^53
function toMinor(v: number): bigint;       // domain number -> BigInt column, throws on non-integer
function fromQtyMilli(v: number): number;  // 1500 -> 1.5
function toQtyMilli(v: number): number;    // 1.5  -> 1500
// mapping.ts
function rowToDraft(row: InvoiceRow): { draft: InvoiceDraft; number: string; state: InvoiceState; version: number };
function draftToRow(draft: InvoiceDraft, calc: CalculatedInvoice<InvoiceLine>): InvoiceRowWrite;
```

- [ ] **Step 1: Write the failing tests**

`src/domain/money/bigint.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { fromMinor, fromQtyMilli, toMinor, toQtyMilli } from "./bigint";

describe("fromMinor", () => {
  it("converts a BigInt column to a domain number", () => {
    expect(fromMinor(33868360n)).toBe(33868360);
    expect(fromMinor(0n)).toBe(0);
  });
  it("throws rather than silently losing precision past 2^53", () => {
    // Number(9007199254740993n) is 9007199254740992 — a wrong amount, silently.
    expect(() => fromMinor(9007199254740993n)).toThrow(/safe integer/i);
  });
});

describe("toMinor", () => {
  it("converts a domain number to a BigInt column", () => {
    expect(toMinor(33868360)).toBe(33868360n);
  });
  it.each([1.5, NaN, Infinity])("throws on %p: money is never fractional minor units", (v) => {
    expect(() => toMinor(v)).toThrow(/whole number/i);
  });
});

describe("qty milli", () => {
  it("round-trips 3 decimals exactly", () => {
    for (const q of [1, 1.5, 0.333, 2.345, 1000]) expect(fromQtyMilli(toQtyMilli(q))).toBe(q);
  });
  it("scales without float drift", () => {
    expect(toQtyMilli(0.1)).toBe(100);   // not 100.00000000000001
    expect(toQtyMilli(2.345)).toBe(2345);
  });
  it("throws past 3 decimals rather than rounding silently", () => {
    expect(() => toQtyMilli(1.2345)).toThrow(/3 decimals/i);
  });
});
```

`src/features/invoices/mapping.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { calculateInvoice } from "@/domain/invoice/calculate";
import { draftToRow, rowToDraft, type InvoiceRow } from "./mapping";

const row: InvoiceRow = {
  id: "11111111-1111-4111-8111-111111111111",
  number: "INV2608002",
  state: "ISSUED",
  version: 3,
  companyId: "22222222-2222-4222-8222-222222222222",
  customerId: "33333333-3333-4333-8333-333333333333",
  // Frozen at issue time: the bill-to as printed, not the live customer row.
  customerSnapshot: {
    name: "ALSUM INFOTECH PRIVATE LIMITED",
    addressLines: ["Chennai"],
    gstin: "33AAGCA7303P1ZK",
    stateCode: "33",
    emails: ["hr@alsuminfotech.com"],
  },
  issueDate: new Date("2026-08-01T00:00:00Z"),
  dueDate: null,
  paymentTerms: null,
  currency: "INR",
  template: "classic",
  gstEnabled: true,
  taxRateBp: 1800,
  notes: null,
  lines: [
    { id: "44444444-4444-4444-8444-444444444444", position: 0, description: "Consulting", hsnSac: "998314", qtyMilli: 1500, rateMinor: 7000000n, amountMinor: 10500000n },
  ],
};

describe("rowToDraft", () => {
  it("converts money and qty into domain units", () => {
    const { draft } = rowToDraft(row);
    expect(draft.lines[0]).toEqual({ id: row.lines[0]!.id, description: "Consulting", hsnSac: "998314", qty: 1.5, rateMinor: 7000000 });
  });
  it("renders the date without timezone drift", () => {
    // new Date(...).toISOString().slice(0,10) is correct only because @db.Date
    // values come back as UTC midnight; a local-time format would show Jul 31.
    expect(rowToDraft(row).draft.issueDate).toBe("2026-08-01");
  });
  it("carries the number, state and version for the editor's header and version guard", () => {
    expect(rowToDraft(row)).toMatchObject({ number: "INV2608002", state: "ISSUED", version: 3 });
  });
  it("uses the frozen snapshot, so renaming the customer never rewrites a sent invoice", () => {
    expect(rowToDraft(row).draft.customer.name).toBe("ALSUM INFOTECH PRIVATE LIMITED");
  });
});

describe("draftToRow", () => {
  it("writes the totals the calculator produced, never a typed value", () => {
    const { draft } = rowToDraft(row);
    const calc = calculateInvoice(draft.lines, {
      currency: "INR", gstEnabled: true, taxRateBp: 1800, sellerStateCode: "29", placeOfSupplyStateCode: "33",
    });
    const write = draftToRow(draft, calc);
    expect(write.subtotalMinor).toBe(10500000n);
    expect(write.taxMinor).toBe(1890000n);
    expect(write.totalMinor).toBe(12390000n);
    expect(write.lines[0]).toMatchObject({ qtyMilli: 1500, rateMinor: 7000000n, amountMinor: 10500000n, position: 0 });
  });
  it("round-trips through the database types unchanged", () => {
    const { draft } = rowToDraft(row);
    const calc = calculateInvoice(draft.lines, {
      currency: "INR", gstEnabled: true, taxRateBp: 1800, sellerStateCode: "29", placeOfSupplyStateCode: "33",
    });
    const write = draftToRow(draft, calc);
    const again = rowToDraft({ ...row, ...write, lines: write.lines.map((l, i) => ({ ...l, id: row.lines[i]!.id })) } as InvoiceRow);
    expect(again.draft.lines).toEqual(draft.lines);
  });
});
```

- [ ] **Step 2: Run them and watch them fail** — `pnpm test src/domain/money/bigint src/features/invoices/mapping`. Expected: module not found.

- [ ] **Step 3: Implement**

`src/domain/money/bigint.ts`
```ts
/**
 * The single crossing between Prisma's BigInt money columns and the domain's
 * numbers. Both directions refuse anything lossy: the failure mode this exists
 * to prevent is a wrong amount that nobody notices.
 */
export function fromMinor(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`${value} is past the safe integer range`);
  return n;
}

export function toMinor(value: number): bigint {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Expected a whole number of minor units, got ${value}`);
  return BigInt(value);
}

/** Qty is stored as thousandths so 0.1 + 0.2 arithmetic never reaches the database. */
export function toQtyMilli(qty: number): number {
  const milli = Math.round(qty * 1000);
  if (Math.abs(milli - qty * 1000) > 1e-6) throw new RangeError(`Quantity allows at most 3 decimals, got ${qty}`);
  return milli;
}

export function fromQtyMilli(milli: number): number {
  return milli / 1000;
}
```

`src/features/invoices/mapping.ts` — types mirror the Prisma row; `rowToDraft` converts with the helpers above and formats `@db.Date` as `toISOString().slice(0, 10)`; `draftToRow` takes the already-computed `CalculatedInvoice` so it cannot invent a total. Write `position` from array index.

- [ ] **Step 4: Watch them pass** — `pnpm test`. Expected: all green.
- [ ] **Step 5: Commit** — `git commit -m "feat(invoices): BigInt boundary and row/draft mapping"`

---

### Task 2: Classic PDF template and download route

Ships something visible before any editor exists: the two seeded invoices become real PDFs.

**Files:** Create `src/pdf/props.ts`, `props.test.ts`, `src/pdf/invoice-document.tsx`, `src/pdf/render.ts`, `src/app/(app)/invoices/[id]/pdf/route.ts`, `src/features/invoices/queries.ts`. Modify `package.json`.

**Interfaces:**
```ts
interface InvoiceDocumentProps {
  number: string; state: InvoiceState;
  seller: { name; addressLines: string[]; email; gstin; lut; stateCode;
            bank: { name; account; ifsc; branch } | null };
  customer: CustomerSnapshot;
  issueDate: string; dueDate: string | null; paymentTerms: string | null;
  currency: CurrencyCode; notes: string | null;
  calc: CalculatedInvoice<InvoiceLine>;
}
function buildDocumentProps(draft: InvoiceDraft, company: CompanyForPdf, number: string, state: InvoiceState): InvoiceDocumentProps;
function InvoiceDocument(props: { doc: InvoiceDocumentProps }): JSX.Element;
async function renderInvoicePdf(doc: InvoiceDocumentProps): Promise<Buffer>;  // server only
```

**Layout — faithful to the Google Doc, with the missing GST fields shown only when filled** (the user's choice):
- Header left: seller name (bold), address lines, email, `GST: <gstin>`, `LUT: <lut>` (each line omitted when absent).
- Right: `Invoice` + number; `DATE`; `BALANCE DUE <CUR> <amount>` in a tinted box.
- `BILL TO` block from the **frozen snapshot**, including customer GSTIN when present.
- Table: `DESCRIPTION | HSN/SAC | RATE | QTY | AMOUNT`. **The HSN/SAC column is dropped entirely when no line has one**, so a simple invoice looks exactly like today's.
- Under the table: `Subtotal`, then one row per tax line (`IGST 18%` or `CGST 9%` + `SGST 9%`), then `BALANCE DUE`. No tax rows at all on an export.
- `Amount in words` line, from `calc.totalInWords`.
- On an export: `Supply meant for export under LUT without payment of IGST` + the LUT number.
- `Payment Information` block: company name, account, IFSC, bank, branch.
- Due date and payment terms render only when set.
- A `DRAFT` watermark when `state === "DRAFT"`, so an unfinished invoice can never be mistaken for a sent one.

- [ ] **Step 1: Install** — `pnpm add @react-pdf/renderer@^4.9.0`
- [ ] **Step 2: Write the failing test for `buildDocumentProps`**

`src/pdf/props.test.ts` — assert against the real INV2608002 data: subtotal ₹2,87,020.00, one IGST line at 18% = ₹51,663.60, total ₹3,38,683.60, words `"Rupees Three Lakh …"`; and for the USD invoice, `taxes` empty and `showLut` true. Assert `showHsnColumn` is false when no line carries one and true when any does.

- [ ] **Step 3: Run it, watch it fail.**
- [ ] **Step 4: Implement `props.ts`, then `invoice-document.tsx`, then `render.ts`.**

`src/pdf/render.ts`
```ts
import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoiceDocument } from "./invoice-document";
import type { InvoiceDocumentProps } from "./props";

/** Server-side render. The same component draws the on-screen preview, so the
 *  downloaded file cannot drift from what the editor showed. */
export async function renderInvoicePdf(doc: InvoiceDocumentProps): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument doc={doc} />);
}
```

`src/app/(app)/invoices/[id]/pdf/route.ts` — `requireUser("read")`, load the invoice, build props, render, return with
`Content-Type: application/pdf` and `Content-Disposition: attachment; filename="INV2609001.pdf"`.
Add `?inline=1` to serve `inline` instead, which the preview iframe uses as a fallback.

- [ ] **Step 5: Verify against the real seeded invoices**

```bash
pnpm dev
# then, with a logged-in cookie:
node scripts/check-pdf.mjs      # written in this step
```
`scripts/check-pdf.mjs` logs in, downloads both seeded invoices, and asserts: HTTP 200, `%PDF-` magic bytes, a plausible size, and that the extracted text contains `INV2608002`, `3,38,683.60`, `IGST`, and `ALSUM INFOTECH PRIVATE LIMITED` — and that the USD one contains `1,326.00` and `LUT` but **not** `IGST`.

- [ ] **Step 6: Commit.**

---

### Task 3: App shell, invoice list, and creating a draft

**Files:** Modify `src/app/(app)/layout.tsx`, `src/app/globals.css`. Create `src/app/(app)/invoices/page.tsx`, `src/app/(app)/invoices/new/route.ts`, extend `src/features/invoices/queries.ts`, create `src/features/invoices/actions.ts`.

- Sidebar: Dashboard · Invoices · Customers · Catalog · Settings. Only Invoices is live; the rest render a short "coming in a later plan" card rather than 404ing.
- List: month tabs, status chip per row, search by number or customer, `New invoice` button. Cards below `md`, table above — never a sideways-scrolling table on a phone (the career site's convention).
- Status chip styling comes from one `STATUS_STYLE` lookup table, not scattered ternaries.
- `createDraftInvoice()`: `requireUser("write")`, allocate a number inside the same transaction as the insert (Plan 1's `allocateInvoiceNumber`), write `version 1` plus the opening `InvoiceVersion` snapshot and an `activity_log` row, then redirect to the editor.
- New CSS: `.field-sm`, `.label`, `.hint`, `.error-line`, `.chip`, `.status-draft|sent|partial|paid|overdue|cancelled`.

- [ ] Steps: write the query test for `listInvoices` filtering/sorting → fail → implement → list renders the two seeded invoices with correct chips and totals → commit.

---

### Task 4: The split editor shell and live preview

**Files:** Create `src/app/(app)/invoices/[id]/page.tsx`, `src/features/invoices/editor/invoice-editor.tsx`, `pdf-preview.tsx`.

- Server page: `requireUser("read")`, load invoice + company + customers, compute `canEdit = can(user.role, "write") && state !== "CANCELLED"`, pass down.
- Client editor owns `const [draft, setDraft] = useState(initialDraft)` and derives everything:
  ```ts
  const calc = useMemo(() => calculateInvoice(draft.lines, taxContext(draft, company)), [draft, company]);
  ```
- Layout: CSS grid, `grid-template-columns: 1fr var(--preview-width)`, divider draggable via a `<div role="separator" aria-orientation="vertical" tabindex="0">` that also responds to arrow keys. Width persisted in `localStorage`, wrapped in try/catch.
- Below `lg`: a two-button segmented control swaps Edit / Preview instead of showing both.
- Sticky header: number chip · status pill · autosave status · `Download` · `Issue` · (later plans add Send / Duplicate / History).
- Preview: `pdf-preview.tsx` is `dynamic(() => import("./pdf-canvas"), { ssr: false })`. Inside, `usePDF({ document: <InvoiceDocument doc={props} /> })` with the props debounced 400ms. **Keep showing the previous blob URL while the next renders**, so typing does not flash white. Revoke the old object URL on swap.

- [ ] Steps: build the shell with a static preview first, confirm it renders the seeded invoice, then wire the debounced re-render, then commit.

---

### Task 5: The line-item grid

**Files:** Create `line-grid.tsx`, `money-input.tsx`, `src/features/invoices/editor/rows.ts` + `rows.test.ts`.

Row operations are pure and tested; the component only wires events:
```ts
function addRow(lines: InvoiceLine[], at?: number): InvoiceLine[];
function removeRow(lines: InvoiceLine[], id: string): InvoiceLine[];   // never returns []
function updateRow(lines: InvoiceLine[], id: string, patch: Partial<InvoiceLine>): InvoiceLine[];
function moveRow(lines: InvoiceLine[], from: number, to: number): InvoiceLine[];
```

- Columns: drag grip · Description · HSN/SAC · Qty · Rate · Amount (read-only) · remove.
- **Amount is never an input** — it is `formatAmount(calc.lines[i].amountMinor)`. This is the class of error INV2608002 already contains.
- Keyboard: Tab moves naturally; **Enter in the last row's last field appends a row and focuses its description**; ArrowUp/ArrowDown move between rows in the same column; the remove button is always reachable by Tab.
- Reordering: `@dnd-kit/core` + `@dnd-kit/sortable`, with `PointerSensor` `activationConstraint: { distance: 6 }` so a click never starts a drag, and `KeyboardSensor` so it works without a mouse. The grip is a `<button aria-label="Reorder line N">`, never the whole row.
- `money-input.tsx`: shows the raw string while focused, `formatAmount` when not, and commits through `parseMoney` on blur. Invalid input reverts to the last good value and shows a one-line hint — it never silently stores a wrong number.
- A qty input accepts up to 3 decimals; more shows the hint.

- [ ] Steps: test the four pure row functions first (including `removeRow` refusing to empty the grid, and `moveRow` bounds) → fail → implement → wire the component → commit.

---

### Task 6: Customer picker

**Files:** Create `customer-picker.tsx`; extend `queries.ts`.

- A `<button>` opens a native `<dialog>` with a search box, filtering the customer list already loaded by the server page (three users, tens of customers — no server round trip needed).
  `ponytail: client-side filter over the full list. Move to a server search when the list outgrows a few hundred.`
- Choosing a customer fills `draft.customer` from that row **as a snapshot copy**, and sets `customerId`, `currency` and `stateCode`. Editing those fields afterwards changes only this invoice.
- A visible line states the freeze: "Saved to this invoice. Editing the customer later won't change it."
- `+ New customer` is present but disabled with the hint "Added in Plan 4" — better than a button that 404s.
- Escape and backdrop click close; `onCancel` is intercepted so a busy state could veto it later.

- [ ] Steps: render, filter, select, assert the draft updates and that a later edit of the snapshot does not write back to the customer row → commit.

---

### Task 7: Autosave, the version guard, and Issue

**Files:** Create `use-autosave.ts`; extend `actions.ts`.

```ts
type SaveState = { status: "idle" | "saving" | "saved" | "error" | "conflict"; at?: number; message?: string };
function useAutosave(draft: InvoiceDraft, version: number, opts: { enabled: boolean; save: (d, v) => Promise<SaveResult> }): SaveState;
```

- Debounce 800ms after the last keystroke, using the `useRef` timer idiom (the career site's, no library).
- **Skip the write when the draft is unchanged** from the last saved one, so idle tabs do not write.
- Also flush on `visibilitychange` to hidden and on `beforeunload`, so a tab closed mid-edit still saves.
- `saveDraft(id, expectedVersion, draft)`:
  - `requireUser("write")` — rejects a VIEWER even when called directly.
  - Refuses to touch a `CANCELLED` invoice.
  - `updateMany({ where: { id, version: expectedVersion }, data: { ...draftToRow(...), version: { increment: 1 } } })`; a count of 0 means someone else saved first → return `{ ok: false, reason: "conflict" }`.
  - Replaces lines in the same transaction, and writes the `activity_log` row inside it, so a save can never be logged without happening or happen without being logged.
- On conflict the editor stops autosaving and shows a banner: "This invoice was changed in another tab. Reload to see the latest — your unsaved text is still in this form." No silent overwrite, no silent data loss.
- On network failure: status `error` with a Retry button; the draft stays in state.
- `issueInvoice(id)`: `requireUser("write")`, run `validateForIssue`, and on any problem return the list for display next to the offending fields. On success set `state = ISSUED` and write the version snapshot.

- [ ] Steps: test the conflict path against the real test database (two saves with the same `expectedVersion`; the second must report conflict and must not have changed the row) → fail → implement → commit.

---

### Task 8: End-to-end verification

- [ ] Extend `scripts/check-editor.mjs`: log in → create a draft → assert it got `INV2609001` (September, counter continuing from the seed) → save lines → assert totals in the database equal `calculateInvoice`'s → download the PDF → assert its text contains the same total → save twice with a stale version → assert the second reports a conflict → assert a VIEWER's `saveDraft` is rejected.
- [ ] Manual pass: open the editor, type a rate, watch the preview and totals update, reload and confirm it persisted, drag a row, remove a row, download and open the file.
- [ ] `pnpm test && pnpm typecheck && pnpm build` all clean.
- [ ] Final whole-branch review by a fresh reviewer on the most capable model, then one fix pass.

---

## Done when
- A new invoice can be created, edited with a live preview, and downloaded, and the downloaded PDF matches the preview.
- Reopening the invoice shows exactly what was typed.
- Totals in the database always equal what `calculateInvoice` produces for the stored lines.
- A second tab cannot silently overwrite the first.
- A VIEWER cannot save, through the UI or by calling the action.
