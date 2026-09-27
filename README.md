# finclust_invoice

Invoice generator for FINCLUST PRIVATE LIMITED.

Write an invoice with the editor on the left and a live PDF preview on the
right, then download it, send it, and come back and edit it later with every
change kept in history.

## Why

Invoices used to be written by hand in Google Docs, which put arithmetic errors
onto filed GST invoices. The app calculates every amount from the line items, so
the totals and the tax cannot disagree with what is printed.

## What it does

- Invoice numbers are generated automatically as `INV{YY}{MM}{NNN}`, restarting
  at 001 each month, in one series shared by every seller company.
- GST follows place of supply: same state charges CGST + SGST, another state
  charges IGST, and an export is billed under LUT with no tax.
- Money is held as whole paise or cents, never as a decimal.
- Customers, seller companies and reusable line items are saved and picked from
  a list.
- Every save keeps a version, so you can read what changed and restore it.
- Invoices are never deleted, only cancelled, so the number series has no gaps.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · Prisma ·
Supabase Postgres (schema `invoicing`) · Vitest

## Running it

```bash
pnpm install
cp .env.example .env     # then fill it in
pnpm db:deploy           # apply migrations
pnpm db:seed             # seller company, customers, admin user
pnpm dev                 # http://localhost:3100
```

## Checks

```bash
pnpm test                # unit tests, plus DB tests when TEST_DATABASE_URL is set
pnpm typecheck
pnpm build
node scripts/check-login.mjs   # login and throttle checks, needs pnpm dev running
```

## Layout

| Path | What lives there |
| --- | --- |
| `src/domain/` | Pure logic: money, GST, numbering, status, diff. No framework imports. |
| `src/features/` | One folder per slice: auth, invoices, customers, delivery. |
| `src/infra/` | Adapters: database, storage, mail. |
| `src/app/` | Next.js routes, kept thin. |
| `docs/superpowers/` | The design spec and the implementation plans. |
