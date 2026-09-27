/**
 * Records money against an invoice and checks the balance, the status and the
 * timeline all follow — including after a payment is removed, which is where a
 * counter that only ever increments would go wrong.
 *
 * Needs `pnpm dev` running.  Run: pnpm check:payments
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const B = process.env.BASE_URL ?? "http://localhost:3100";
const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").map((l) => l.match(/^(\w+)="?([^"]*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
let failed = 0;
const check = (n, ok, x = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); };

async function hiddenFields(path, marker, cookie) {
  const html = await (await fetch(`${B}${path}`, { headers: cookie ? { cookie } : {} })).text();
  const form = [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes(marker));
  if (!form) throw new Error(`no form containing ${JSON.stringify(marker)}`);
  const fd = new FormData();
  for (const i of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const n = (i[0].match(/name="([^"]*)"/) || [])[1];
    const v = ((i[0].match(/value="([^"]*)"/) || [])[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    if (n) fd.set(n, v);
  }
  return fd;
}

const lf = await hiddenFields("/login", "current-password");
lf.set("next", "/"); lf.set("email", env.SEED_ADMIN_EMAIL); lf.set("password", env.SEED_ADMIN_PASSWORD);
const cookie = ((await fetch(`${B}/login`, { method: "POST", body: lf, redirect: "manual" })).headers.get("set-cookie") ?? "").split(";")[0];

const call = async (action, args) =>
  (await fetch(`${B}/api/dev`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ action, args }) })).json();
const state = async (id) => (await fetch(`${B}/api/dev?id=${id}`, { headers: { cookie } })).json();

// A fresh invoice of exactly 1,00,000 + 18% = 1,18,000 so the arithmetic is obvious.
const cf = await hiddenFields("/invoices", "New invoice", cookie);
const created = await fetch(`${B}/invoices`, { method: "POST", body: cf, headers: { cookie }, redirect: "manual" });
const id = ((created.headers.get("location") ?? "").match(/invoices\/([0-9a-f-]{36})/) || [])[1];
const st0 = await state(id);
const draft = {
  companyId: st0.companyId, customerId: null,
  customer: { name: "Payments Test Ltd", addressLines: ["Chennai"], gstin: null, stateCode: "33", emails: [] },
  issueDate: "2026-09-28", dueDate: "2026-10-15", paymentTerms: null,
  currency: "INR", gstEnabled: true, taxRateBp: 1800, template: "classic", notes: null,
  lines: [{ id: randomUUID(), description: "Consulting", hsnSac: null, qty: 1, rateMinor: 10000000 }],
};
const saved = await call("saveDraft", [id, 1, draft]);
const tooEarly = await call("recordPayment", [id, { date: "2026-09-28", amount: "1000", method: "UPI", reference: "" }]);
check("a draft cannot take a payment", tooEarly.ok === false, (tooEarly.problems ?? [])[0]);

const issued = await call("issueInvoice", [id, saved.version, draft]);
check("invoice issued", issued.ok === true, issued.number);
let s = await state(id);
check("total is 1,18,000", s.totalMinor === 11800000, String(s.totalMinor));

// ---------------------------------------------------------------- part pay
const bad = await call("recordPayment", [id, { date: "2026-09-29", amount: "not money", method: "UPI", reference: "" }]);
check("a non-amount is refused", bad.ok === false, (bad.problems ?? [])[0]);

const part = await call("recordPayment", [id, { date: "2026-09-29", amount: "50,000", method: "Bank transfer", reference: "UTR123" }]);
check("a part payment is recorded", part.ok === true, JSON.stringify(part).slice(0, 90));
s = await state(id);
check("paid total updates", s.paidMinor === 5000000, String(s.paidMinor));
let list = await (await fetch(`${B}/invoices`, { headers: { cookie } })).text();
check("the list shows what is still owed", list.replace(/<!--.*?-->/g, "").includes("68,000.00"), "1,18,000 - 50,000");

// ------------------------------------------------------------- settle it
const rest = await call("markPaidInFull", [id]);
check("paid in full settles the balance", rest.ok === true, JSON.stringify(rest).slice(0, 90));
s = await state(id);
check("paid equals the total", s.paidMinor === s.totalMinor, `${s.paidMinor} vs ${s.totalMinor}`);

// --------------------------------- removing a payment must correct the total
const payments = await call("listPayments", [id]);
check("both payments are listed", Array.isArray(payments) && payments.length === 2, String(payments?.length));
// Whichever comes first in the list: the point is that the remaining total is
// recomputed from what is left, not decremented from a running counter.
const dropped = payments[0];
const expected = payments.slice(1).reduce((sum, p) => sum + p.amountMinor, 0);
const removed = await call("removePayment", [dropped.id]);
check("a payment can be removed", removed.ok === true);
s = await state(id);
check(
  "the balance is recomputed from what is left, not decremented",
  s.paidMinor === expected,
  `${s.paidMinor} should equal ${expected} after dropping ${dropped.amountMinor}`,
);

const timeline = await (await fetch(`${B}/api/dev?id=${id}&what=timeline`, { headers: { cookie } })).json();
check("payments appear on the timeline", timeline.some((e) => e.kind === "paid"));

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall payment checks passed");
process.exit(failed ? 1 : 0);
