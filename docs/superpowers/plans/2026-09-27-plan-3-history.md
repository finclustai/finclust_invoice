# Plan 3: Version History, Activity Timeline, Diff and Restore

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Open any invoice and see, in one readable timeline, everything that has happened to it — who changed what, when, and exactly which fields moved — and put an earlier version back without losing the record that you did.

**Architecture:** Every save already writes the invoice row. This plan adds a *snapshot* alongside it, coalesced into editing sessions so an afternoon of autosaves reads as a handful of entries rather than four hundred. Plan 1's `diffSnapshots` turns two snapshots into sentences a person can read. Restore is an ordinary forward write of an old snapshot, never a deletion, so history only ever grows.

**Tech Stack:** Existing. No new dependencies.

**Spec:** [the design spec](../specs/2026-09-27-invoice-generator-design.md) — "History drawer (the logs)", which the user singled out: *"we need logs … but make sure ux of this feature is good as well, ui should be easy to track, use and see."*

**Deferred out of this plan:** archiving the exact PDF bytes of each send needs Supabase Storage, and those credentials are not set yet. It moves to Plan 6 (delivery), which needs Storage regardless. Everything here is database-only and ships without them.

## Global Constraints
Plans 1 and 2's constraints hold. Added:
- **History is append-only.** Nothing in this plan deletes or rewrites an `invoice_versions` row except the deliberate session coalescing described below, which only ever replaces the newest row and only within its own open session.
- **A snapshot is what was on the invoice**, not a reference to it: restoring or renaming a customer must never change what an old version says.
- Timeline reads must not scale with edit count on the page: the drawer pages the timeline rather than loading every version.

## Review Focus
1. **An afternoon of autosaves.** The timeline must stay readable — a few session entries, not one per keystroke burst — while the *first* and *last* state of that session are both still recoverable.
2. **Two people editing on the same day.** Their edits must not coalesce into one another's sessions, and the timeline must attribute each correctly.
3. **Restoring an invoice that was issued.** The number, the state and the GST series must not change; only the content comes back.
4. **A version written before a field existed** (an older snapshot missing `hsnSac`, say): opening it must not crash the drawer.
5. **A VIEWER (the CA)**: can read the whole timeline and every diff, cannot restore — enforced server-side, not only by hiding the button.

---

## File Map
```
src/domain/invoice/history.ts        coalesceInto / describeVersion / summarise  (+test)
src/features/invoices/versions.ts    recordVersion, listTimeline, loadVersion, restoreVersion
src/features/invoices/versions.int.test.ts   coalescing + restore against the test DB
src/features/invoices/write-draft.ts MODIFY: record a snapshot in the same transaction
src/features/invoices/actions.ts     MODIFY: restoreVersionAction
src/features/invoices/editor/history-drawer.tsx    the timeline + diff UI
src/features/invoices/editor/invoice-editor.tsx    MODIFY: History button
src/app/globals.css                  MODIFY: .timeline-* rules
prisma/migrations/<ts>_version_session/migration.sql   adds invoice_versions.session_id + index
```

---

### Task 1: Decide what a "version" is (pure, tested)

The whole plan turns on one question: when does a save become a new timeline entry?

**Rule:** a save joins the newest version's *session* when all of: same author, same invoice state, and within `SESSION_MINUTES` (30) of that session's last write. Otherwise it starts a new one. Joining **replaces** that session's snapshot and bumps its `changeCount`; starting a new one inserts.

Thirty minutes because the unit a person recognises is "the edit I made after lunch", not "the keystroke at 14:03:11". The first snapshot of a session is preserved as the *previous* session's final state, so nothing becomes unrecoverable.

**Files:** Create `src/domain/invoice/history.ts` + `history.test.ts`.

**Interfaces:**
```ts
const SESSION_MINUTES = 30;
interface SessionHead { userId: string | null; state: InvoiceState; at: number; }
function joinsSession(head: SessionHead | null, next: SessionHead): boolean;
type TimelineKind = "created" | "edited" | "issued" | "restored" | "cancelled" | "downloaded" | "sent" | "paid";
function summarise(changes: Change[]): string;   // "Rate on line 2, and 3 more"
```

- [ ] **Step 1: failing test** — cover: null head starts a session; same user + state + 29 min joins; 31 min does not; a different user does not; a state change (DRAFT→ISSUED) does not; `summarise([])` is "No changes"; one change reads as itself; four read as "…, and 3 more".
- [ ] **Step 2: run it, watch it fail.**
- [ ] **Step 3: implement.**
- [ ] **Step 4: watch it pass.** `pnpm test src/domain/invoice/history`
- [ ] **Step 5: commit.**

---

### Task 2: Record snapshots inside the write

**Files:** Migration; modify `write-draft.ts`; create `versions.ts`; create `versions.int.test.ts`.

Migration adds to `invoice_versions`: `session_id UUID`, `change_count INT NOT NULL DEFAULT 1`, `updated_at TIMESTAMPTZ`, and an index on `(invoice_id, created_at DESC)`.

`recordVersion(tx, { invoiceId, version, snapshot, reason, userId, state })` does the coalescing from Task 1 and is called **inside `writeDraft`'s existing transaction**, so a save can never land without its history entry.

- [ ] **Step 1: failing integration test** (`versions.int.test.ts`, skipped without `TEST_DATABASE_URL`):
  - Two saves 1 minute apart by one user → **one** version row, `changeCount` 2, snapshot equal to the second save.
  - Two saves 40 minutes apart → **two** rows.
  - Two saves by different users 1 minute apart → **two** rows, correctly attributed.
  - A save that conflicts on version writes **no** version row.
  - Issue writes its own row with `reason: "Issued"` regardless of timing.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5: commit.**

---

### Task 3: Read the timeline

**Files:** extend `versions.ts`.

```ts
interface TimelineEntry {
  id: string; kind: TimelineKind; at: string; actor: string | null;
  version: number | null; changeCount: number; summary: string; canRestore: boolean;
}
function listTimeline(invoiceId: string, opts?: { limit?: number; before?: string }): Promise<TimelineEntry[]>;
function loadVersionWithDiff(invoiceId: string, version: number): Promise<{ snapshot; changes: Change[] } | null>;
```

`listTimeline` merges `invoice_versions` with the `activity_log` rows that have no version of their own (downloads, and later sends and payments), newest first, paged by `before`. Actor names come from one `users` lookup, not a join per row.

`loadVersionWithDiff` diffs a version against the one before it using Plan 1's `diffSnapshots`, tolerating an older snapshot that lacks newer fields (Review Focus 4) by parsing it through `invoiceDraftSchema.partial()` and filling defaults.

- [ ] Steps: test paging and the older-snapshot tolerance → fail → implement → pass → commit.

---

### Task 4: The history drawer (the part the user cares about)

**Files:** `history-drawer.tsx`; modify `invoice-editor.tsx` and `globals.css`.

A native `<dialog>` pinned to the right edge (the career site's drawer pattern: `m-0 ml-auto h-dvh w-full max-w-md`), opened by a **History** button in the editor header.

- **One vertical timeline**, newest first. Each entry: an icon per kind, a one-line summary, the actor's first name, and a relative time ("2 hours ago") with the exact timestamp in `title`.
- **Click an entry to expand it in place** — no second screen, no navigation. It reveals the change list as sentences:
  `Line 2 rate  75,000.00 → 70,000.00`, with the old value struck through in `--mid` and the new one in `--ink`, aligned in a two-column grid so a scan down the page works.
- **Tall diffs collapse** to the first six changes plus "Show all 14".
- **"Restore this version"** sits inside the expanded entry, never on the collapsed row, so it cannot be hit by accident. It asks for confirmation naming the version and what will change, then writes the old content forward as a new entry labelled "Restored from 12 Sep".
- Hidden entirely for a VIEWER; `restoreVersionAction` calls `requireUser("write")` regardless.
- Empty state: "Nothing has changed yet. Edits, sends and payments will show up here."
- Keyboard: Escape closes; the drawer traps focus because `<dialog>` does it for free; entries are `<button>`s so Tab and Enter work.

- [ ] Steps: static render with seeded versions → expand/diff → restore with confirmation → VIEWER check → commit.

---

### Task 5: Verification

- [ ] `scripts/check-history.mjs`: log in → create a draft → save three times quickly → assert the timeline shows **one** edit entry with changeCount 3 → issue it → assert a second entry → restore the first version → assert a third entry and that the invoice content matches version 1 while `number` and `state` are unchanged.
- [ ] Manual: open an invoice, change a rate, open History, confirm the sentence names the right line and the right old and new amounts.
- [ ] `pnpm test && pnpm typecheck && pnpm build` clean; existing check scripts still pass.
- [ ] Fresh-reviewer pass, then one fix pass.

## Done when
- Editing an invoice through an afternoon produces a timeline you can actually read.
- Every entry says who, when, and what changed, in the invoice's own money format.
- Restoring brings content back without touching the number, the state, or the record of what happened.
- A VIEWER can read all of it and change none of it.
