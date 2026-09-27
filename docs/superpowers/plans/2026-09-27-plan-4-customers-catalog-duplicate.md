# Plan 4: Customers, Companies, Duplicate and the Catalog

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline).

**Goal:** Stop retyping. Save a customer once and pick it; bill from whichever of your companies is doing the work; repeat last month's invoice in one click; keep the services you bill often with their usual rates.

**Architecture:** Four small slices on top of what exists. Each is a feature folder with its own queries, actions and UI; each route stays a thin shell. The only new domain knowledge is the table of GST state codes, which finally lets the app check that a place of supply is real rather than just two digits.

**Spec:** [the design spec](../specs/2026-09-27-invoice-generator-design.md) — "Customers and catalog pages, Duplicate" and the multiple-seller-company decision.

**Closes:** Plan 2's review finding 16 — today every invoice is billed from whichever company Postgres returns first, though the spec says FINCLUST bills from several.

## Global Constraints
Earlier plans' constraints hold. Added:
- **A customer row is a template, not a link.** Choosing one copies its details onto the invoice. Editing the customer afterwards must never change an invoice that has already gone out.
- **Nothing is deleted.** A customer, company or catalog item that an invoice references is archived, never removed.
- **A place of supply must be a real GST state code**, checked against the official table, not just two digits.
- Duplicating copies content only: never the number, the state, the payments or the history.

## Review Focus
1. **A customer edited after being invoiced.** The old invoice, its PDF and its history must all still show what they showed before.
2. **A GSTIN typed with its state code contradicting the chosen state** — the two must be reconciled at the point of entry, not left to fail at issue.
3. **Switching an invoice's seller company** between two in different states: CGST/SGST must become IGST, and the bank details on the PDF must follow.
4. **Duplicating an invoice whose customer has since been archived or changed:** it must copy what the invoice said, not what the customer says now.
5. **A VIEWER**: can read customers, companies and the catalog; can create, edit and archive none of them.

---

## File Map
```
src/domain/invoice/state-codes.ts        GST_STATES, isValidStateCode, stateName   (+test)
src/domain/invoice/schema.ts             MODIFY: validate stateCode against the table
src/features/customers/{queries,actions,customer-form,customer-list}.tsx
src/features/companies/{queries,actions,company-form,company-list}.tsx
src/features/catalog/{queries,actions,catalog-list}.tsx
src/features/invoices/duplicate.ts       duplicateInvoice + bumpMonth              (+test)
src/features/invoices/editor/…           MODIFY: live "+ New customer", company picker, "/" catalog pick
src/app/(app)/customers/…  /settings/companies/…  /catalog/…   thin routes
```

---

### Task 1: GST state codes (pure, tested)

Until now `stateCode` was any two digits, so `"99"` or `"00"` passed and the tax regime was computed from a state that does not exist.

**Interfaces:**
```ts
const GST_STATES: { code: string; name: string }[];   // 01–38, 97, 99
function isValidStateCode(code: string): boolean;
function stateName(code: string): string | null;
```
- [ ] Test: Karnataka is 29 and Tamil Nadu 33; `"00"`, `"40"`, `"9"` and `""` are rejected; 97 ("Other Territory") and 99 ("Centre Jurisdiction") are accepted; the list has no duplicate codes and is ordered by code.
- [ ] Then tighten `customerSnapshotSchema.stateCode` to use it, and check the existing suite still passes (the seed uses 29 and 33).

### Task 2: Customers

**Pages:** `/customers` (search, archived toggle, Add), `/customers/new`, `/customers/[id]`.

- Form fields: name, address (one textarea, split on newlines), GSTIN, place of supply, emails (comma separated), phone, default currency, notes.
- **GSTIN and state reconcile as you type:** entering a GSTIN fills and locks the state from its first two digits, with a line saying so; clearing the GSTIN unlocks it. This is Review Focus 2, fixed at entry rather than at issue.
- A customer outside India has no GSTIN and their place of supply is "Outside India", which is what makes an invoice an export.
- Archive, never delete; archived rows are hidden from the picker but stay on old invoices.
- Each customer page lists their invoices with totals, so "what do they owe" is answerable without the dashboard.
- `requireUser("write")` on every mutation; the buttons are hidden for a VIEWER and the actions reject them anyway.
- [ ] Verify: create → appears in the editor's picker → edit the name → the already-issued invoice and its PDF are unchanged.

### Task 3: Companies and the company picker

**Pages:** `/settings/companies`, `/settings/companies/[id]`.

- Fields: name, address, email, phone, GSTIN, place of supply, LUT, bank name/account/IFSC/branch, default template.
- The editor shows a **company selector only when more than one exists** — a picker with one option is noise.
- Switching company on a draft recalculates the tax regime (the seller's state is one half of the same-state test) and changes the bank block on the PDF. Blocked once the invoice is issued.
- `getDefaultCompany` stops meaning "whichever came first": ordered, and the editor always sends an explicit `companyId`.
- [ ] Verify: add a second company in another state, switch a draft to it, watch IGST become CGST+SGST and the bank details change in the preview.

### Task 4: Duplicate

`duplicateInvoice(id)` creates a **draft** copying: company, customer snapshot, currency, GST settings, template, notes and all lines (with fresh line ids). It copies **no** number, state, payments or history, and dates it today.

`bumpMonth(text)` is pure and tested: `"August pay"` → `"September pay"`, `"for 15 Days of July Month"` → `"…August Month"`, `"Aug-7"` → `"Sep-7"`; anything with no month name is returned unchanged. Offered as a **checkbox in the duplicate dialog, off by default** — a helpful guess the user confirms, never a silent rewrite.

The dialog also offers "Repeat the last invoice for…" from the invoice list, which is the actual monthly workflow.

- [ ] Verify: duplicate INV2608002 → a new draft with all 6 lines and the same totals, no number, and the original untouched.

### Task 5: Catalog

`/catalog` CRUD over `catalog_items` (description, HSN/SAC, rate, currency). In the line grid, typing `/` in an empty description opens a picker that fills description, HSN/SAC and rate. "Save this line to the catalog" on a row that isn't there yet.

- [ ] Verify: save a line, use it on another invoice, confirm the rate carries.

### Task 6: Verification
- [ ] `scripts/check-customers.mjs`: create → invoice it → rename → assert the issued invoice's snapshot and PDF are unchanged (Review Focus 1); archive → assert it leaves the picker but stays on the invoice.
- [ ] Extend `check-editor.mjs`: duplicate an invoice and assert lines match and the number does not.
- [ ] `pnpm test && pnpm typecheck && pnpm build`, and every existing check script still green.
- [ ] Fresh-reviewer pass, then one fix pass.

## Done when
- A customer is typed once and picked thereafter, and editing them never rewrites a sent invoice.
- Invoices can be billed from any of your companies, with the right tax and bank details.
- Last month's invoice is one click away.
- Common lines come from the catalog instead of being retyped.
