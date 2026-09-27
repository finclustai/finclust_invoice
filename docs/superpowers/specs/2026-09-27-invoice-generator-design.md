# FINCLUST Invoice Studio: Design + Build Plan

## Context
FINCLUST writes invoices by hand in Google Docs (samples: INV2608001 is a USD export under LUT, INV2608002 is an INR invoice with GST@18%). Doing it by hand has already caused errors in INV2608002:
- The "Ramreddy Aug" line has rate 75,000 but amount 70,000.
- One rate is written "25,00.00".
- The header shows USD while the total is in INR.
- The item amounts add up to 2,82,020, but the GST (51,663.60) and the balance (3,38,683.60) only work out if the items total 2,87,020.

There is also no numbering discipline, history, or tracking.

**Goal:** a web app with the editor on the left and a live PDF preview on the right.
- Invoice numbers are generated automatically (INV + YYMM + 3-digit counter, reset every month, one series shared by all companies).
- Totals and GST are calculated by the app.
- Customers are saved and picked from a list.
- Full logs and version history.
- Send to the customer, or a monthly pack to the CA, as a Zoho Mail draft, like the career site does.
- Send by WhatsApp with a wa.me link.
- An analytics dashboard.

Superpowers and mattpocock-skills are already installed. Work follows brainstorming → spec → writing-plans → TDD.

## Decisions (confirmed with user)
- **Stack:** one Next.js 15 app (App Router, route handlers and server actions), React 19, TypeScript, Tailwind v4, Prisma, on the **same Supabase project** in a separate Postgres schema `invoicing`. Files go in a private Storage bucket `invoices`. Deployed as one Vercel project in region bom1.
- **Auth:** copy the career site's pattern (bcrypt + JWT in an httpOnly cookie, login rate limit). Next middleware uses `jose`.
  - Roles: **ADMIN** (everything, users, settings), **ACCOUNTANT** (invoices, customers, sending), **VIEWER** (read and download only, for the CA).
- **Multiple seller companies**, each with its own address, GSTIN, LUT, bank, logo and signature. There is **one shared number series**.
- **Numbering:** `INV{YY}{MM}{NNN}`, where the period comes from the **invoice date**.
  - The counter resets every month.
  - The number is taken atomically from a `invoice_counters(period)` upsert when the invoice is created.
  - Invoices are never hard-deleted. They are **Cancelled**, which keeps the number, so there are no gaps. This is GST-safe.
- **GST:** automatic.
  - Seller and customer in the same state (first 2 digits of the GSTIN): CGST 9% + SGST 9%.
  - Different states: IGST 18%.
  - Export or non-INR invoice: "Supply meant for export under LUT without payment of IGST", with the LUT number.
  - Per-invoice toggle and rate override. Optional HSN/SAC on each line.
- **Currency:** INR and USD at launch, set up so more can be added (currency code, symbol, number format: Indian lakh style for INR, western for USD). **No FX conversion.** The dashboard splits figures by currency.
- **PDF:** `@react-pdf/renderer`. The same component draws the live preview and the downloaded or archived file, so they always match.
  - Several **templates**: "Classic", which is the current layout polished, plus "Modern" and "Minimal". Chosen per invoice, with a default per company.
  - Adds amount in words, logo, signature and a notes/terms block.
- **v1 extras:** payment status tracking, duplicate invoice, CA monthly pack, saved line-item catalog.
- **Logs:** audit trail, version history with field diff and restore, and an archive of each sent or downloaded PDF. The user stressed easy UX for these.

## Architecture: structured, modular, scalable
The structure follows mattpocock's codebase-design: **deep modules** (small interface, lots of behaviour behind it), the dependencies they need passed in, and tests written against each interface. It is feature-sliced so that adding a feature means adding a folder, not touching everything.

```
src/
  domain/                         PURE TS, zero deps on Next/Prisma. 100% vitest.
    invoice/
      calculate.ts   calculateInvoice(draft) → {lines, subtotal, taxes[], total, words}
                      ← ONE deep module: money (minor units), GST split, rounding,
                        currency formatting, amount-in-words. UI + PDF + CSV all call it.
      numbering.ts   periodOf(date) / formatNumber(period, n)
      status.ts      deriveStatus(invoice, payments, today) → Draft|Sent|Partial|Paid|Overdue|Cancelled
      diff.ts        diffVersions(a, b) → human-readable changes[]
      schema.ts      zod InvoiceDraft (single source of truth for form + API validation)
    currency.ts      registry {INR, USD, …}; add a currency = add one entry
  features/                       each = server actions + queries + UI, owns its slice
    auth/        session, roles, can(user, action) permission check
    invoices/    editor/, list/, history/, actions.ts (save, issue, cancel, duplicate)
    customers/   catalog/   companies/   payments/   dashboard/   settings/
    delivery/    send(invoiceId, channel: email|whatsapp|ca-pack)
                  ← deep module: render PDF → archive → channel adapter → log
  infra/                          adapters at real seams (injected, faked in tests)
    db.ts          Prisma client (retry pattern from E:\sudheer\packages\db\src\index.ts)
    storage.ts     port of E:\sudheer\apps\api\src\storage\storage.service.ts
    zoho-mail.ts   port of E:\sudheer\apps\api\src\applications\zoho-mail.ts
    whatsapp.ts    port of E:\sudheer\apps\web\lib\whatsapp.ts
  pdf/
    render.ts      renderInvoicePdf(invoice, templateId) → Buffer
    templates/     classic.tsx, modern.tsx, minimal.tsx: registry keyed by id;
                   add a template = add one file + one registry line
  ui/              design-system primitives (Button, Input, Combobox, Grid, Drawer, Pill…)
  app/             thin Next.js routes only: import from features/, no logic
    login/ (app)/dashboard (app)/invoices/[id] … p/[token]/route.ts
prisma/schema.prisma
```
**Rules:**
- `app/` routes stay thin.
- `features/` never import from each other's internals.
- `domain/` imports nothing external.
- Every write goes through an action that also writes the activity log in the same transaction, so logging can't be forgotten.
- Seams exist only where there is more than one real adapter (Zoho real vs fake, storage real vs in-memory). No speculative abstractions.
- `CONTEXT.md` domain glossary (mattpocock domain-modeling): Invoice, Draft, Issue, Period, Seller company, Customer snapshot, Version, Delivery.
- ADRs in `docs/adr/`, following the career site's convention.

### Data model (Prisma, schema `invoicing`)
- `users` (role enum)
- `companies` (seller profile, bank, lut, gstin, logo/signature paths, defaultTemplate)
- `customers` (name, billing address, gstin, state code, emails[], phone/whatsapp, default currency, notes)
- `catalog_items` (description, hsn_sac, default rate, currency)
- `invoices`:
  - number (unique), period, companyId, customerId, **customer snapshot JSON**, issueDate, dueDate, paymentTerms, currency, template, gstMode, taxRate, notes, status
  - Cached totals: subtotal, tax, total, paid
- `invoice_lines` (position, description, hsn_sac, qty, rate, amount), stored as minor units
- `invoice_counters` (period PK, last)
- `invoice_versions` (invoiceId, version, snapshot JSON, userId, createdAt, reason)
- `payments` (invoiceId, date, amount, method, reference)
- `pdf_archive` (invoiceId, versionId, storagePath, purpose: download | email | whatsapp | ca_pack, sha256)
- `activity_log` (actor, entity, entityId, action, meta JSON, at)
- `share_tokens`
- `settings`

## UX (the core of the request)
- **Split editor:** form on the left, live PDF on the right (debounced ~300ms). The divider can be dragged. On mobile, a tab toggle switches between Edit and Preview.
  - Sticky header: number chip, status pill, "Saved ✓ 2s ago" autosave indicator, and actions: Download · Send ▾ (Email to client / WhatsApp / Copy link) · Duplicate · History.
- **Customer combobox:** type to search, pick a customer, and the Bill To, currency, GST mode and emails fill in. "+ New customer" opens inline without leaving the page.
- **Line items as a spreadsheet grid:** Tab and Enter move between cells, Enter on the last row adds a row, rows reorder by drag (dnd-kit), and "/" searches the catalog. Amount = qty × rate, so it can't be typed and can't be wrong. Totals show live under the grid.
- **Duplicate:** the "New invoice" dialog suggests "Repeat last invoice for <customer>". It copies the lines, gives a new number and today's date, and bumps months in descriptions ("August pay" → "September pay") as a suggestion.
- **History drawer (the logs):** one vertical timeline mixing versions, sends, downloads and payments, each with an icon, actor and relative time.
  - Clicking a version shows a readable diff ("Line 4 rate: 75,000 → 70,000", "Added line…") next to that version's PDF thumbnail.
  - Buttons: **Restore this version** and **Download the exact PDF sent on <date>**.
- **Invoice list:** month tabs, status chips, a search box, bulk select → "Send to CA", overdue rows highlighted, and inline "Mark paid".
- **Dashboard (per currency):**
  - KPIs: billed this month, outstanding, overdue, GST collected this month.
  - Charts: monthly revenue over 12 months (bar), top customers, status breakdown, aging buckets (0-30/31-60/60+).
  - Chart library: Recharts, following the dataviz skill.
- **⌘K palette:** new invoice, go to invoice number, find customer.
- **Visual language: "Evolved FINCLUST" (confirmed).**
  - Same brand as the career site: Hanken Grotesk, warm paper and ink neutrals, orange `#ff8a1e`, green and red status colours, from E:\sudheer\design-system\finclust\MASTER.md.
  - Calmer for daily dense work: 1px soft borders, subtle shadows instead of hard offsets, compact spacing, JetBrains Mono tabular numbers, dark mode, visible focus rings, fully usable from the keyboard.
  - Tokens live in `design-system/invoice/MASTER.md` and the Tailwind `@theme`.
  - Use the impeccable and emil-design-eng skills for polish and micro-interactions (autosave tick, row add, drawer).

## Integrations
- **Zoho draft to client:** render the PDF on the server, archive it, upload it as a Zoho attachment, then create the draft (same calls as the career site: `/api/accounts`, `/messages/attachments`, `/messages` mode=draft).
  - The subject and body come from an editable template.
  - The response returns the drafts URL, and the app logs the send and sets the status to Sent.
- **CA monthly pack:** pick a month and companies, and the app attaches every non-draft invoice PDF plus `summary.csv` to one Zoho draft to the CA email set in Settings.
  - summary.csv columns: number, date, customer, GSTIN, taxable, CGST/SGST/IGST, total, currency, status.
- **WhatsApp:** archive the PDF, create a `share_token`, and open `wa.me/<customer phone>?text=Hi…, invoice INV2609001 for ₹X: https://…/p/<token>`. The token can be revoked, and every open is logged.

## Build phases (each one a vertical slice, test-first on src/domain)
1. Scaffold, Prisma schema and migration, auth and roles, companies and settings, seed with FINCLUST and the 2 sample invoices (with their numbers corrected).
2. Domain library + tests: money, totals, GST split, numbering, amount in words, diff.
3. Split editor: form, grid, customer combobox, Classic template, live preview, autosave, download.
4. Versions, activity log, PDF archive, history drawer with diff and restore.
5. Customers and catalog pages, Duplicate, Modern and Minimal templates.
6. Payments and status (overdue is worked out from the due date), the invoice list.
7. Zoho send, CA pack, WhatsApp link.
8. Dashboard and ⌘K.

Before coding: write the spec to `docs/superpowers/specs/2026-09-27-invoice-generator-design.md` (git init first), then use the writing-plans skill to produce the detailed task plan.

## Verification
- `vitest` on src/domain. Required cases:
  - The sample INR invoice reproduces the correct total, with IGST for a Tamil Nadu customer (33) against a Karnataka seller (29).
  - The USD LUT invoice comes to $1,326.00 with no tax.
  - Numbering reset: INV2608002 → the next invoice in September is INV2609001.
  - Indian formatting: 3,38,683.60.
- Playwright e2e covering login → new invoice → pick customer → add lines → preview updates → download PDF → edit → history shows the diff → restore. Zoho is mocked with a fake server (port E:\sudheer\e2e\fake-zoho.mjs).
- Manual check: open the downloaded PDF and compare it side by side with the samples. Test the VIEWER role cannot edit, and the WhatsApp link opens the PDF.

## Needs from you later (not blocking)
- The Supabase project env vars: the same DATABASE_URL and DIRECT_URL, SUPABASE_URL, SUPABASE_SECRET_KEY.
- Zoho refresh token (the existing one works if its scopes include messages).
- CA email address.
- Company logo and signature images.
