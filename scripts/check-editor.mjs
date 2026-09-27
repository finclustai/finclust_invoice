/**
 * Drives the whole editing path the way the browser does: create a draft,
 * save real lines, prove the stored totals match the calculator, issue it,
 * prove the number is allocated at issue from the invoice date's month, and
 * prove the version guard and the VIEWER lockdown hold.
 *
 * Needs `pnpm dev` running.  Run: pnpm check:editor
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const B = process.env.BASE_URL ?? "http://localhost:3100";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .map((l) => l.match(/^(\w+)="?([^"]*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

/**
 * Replays one form the way a browser with JS disabled does. A page can hold
 * several forms, each with its own $ACTION_* hidden inputs, so the fields must
 * come from the single form containing `marker`.
 */
async function hiddenFields(path, marker, cookie) {
  const html = await (await fetch(`${B}${path}`, { headers: cookie ? { cookie } : {} })).text();
  const form = [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0]).find((f) => f.includes(marker));
  if (!form) throw new Error(`no form containing ${JSON.stringify(marker)} on ${path}`);
  const fd = new FormData();
  for (const i of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const n = (i[0].match(/name="([^"]*)"/) || [])[1];
    const v = ((i[0].match(/value="([^"]*)"/) || [])[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    if (n) fd.set(n, v);
  }
  return fd;
}

async function login(email, password) {
  const fd = await hiddenFields("/login", "current-password");
  fd.set("next", "/");
  fd.set("email", email);
  fd.set("password", password);
  const res = await fetch(`${B}/login`, { method: "POST", body: fd, redirect: "manual" });
  return ((res.headers.get("set-cookie") ?? "").split(";")[0]) || "";
}

const cookie = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
if (!cookie.includes("invoice_session")) throw new Error("login failed — check SEED_ADMIN_* in .env");

// ---------------------------------------------------------------- create
const create = await hiddenFields("/invoices", "New invoice", cookie);
const created = await fetch(`${B}/invoices`, { method: "POST", body: create, headers: { cookie }, redirect: "manual" });
const id = ((created.headers.get("location") ?? "").match(/invoices\/([0-9a-f-]{36})/) || [])[1];
check("New invoice creates a draft", Boolean(id), created.headers.get("location") ?? `status ${created.status}`);
if (!id) process.exit(1);

const index = await (await fetch(`${B}/api/dev?what=index`, { headers: { cookie } })).json();
const fresh = index.find((i) => i.id === id);
// A draft must not consume a GST number: an abandoned one would leave a gap,
// and moving its date to another month would file it under the wrong return.
check("a draft holds no GST number", fresh?.number.startsWith("DRAFT-"), fresh?.number);

// ------------------------------------------------------------------ save
const draft = {
  companyId: (await (await fetch(`${B}/api/dev?id=${id}`, { headers: { cookie } })).json()).companyId,
  customerId: null,
  customer: {
    name: "ALSUM INFOTECH PRIVATE LIMITED",
    addressLines: ["Chennai"],
    gstin: "33AAGCA7303P1ZK",
    stateCode: "33",
    emails: [],
  },
  issueDate: "2026-09-15",
  dueDate: null,
  paymentTerms: null,
  currency: "INR",
  gstEnabled: true,
  taxRateBp: 1800,
  template: "classic",
  notes: null,
  lines: [
    { id: randomUUID(), description: "Consulting", hsnSac: null, qty: 1, rateMinor: 10000000 },
    { id: randomUUID(), description: "Support", hsnSac: null, qty: 1.5, rateMinor: 2000000 },
  ],
};

const callAction = async (action, args, as = cookie) =>
  (await fetch(`${B}/api/dev`, {
    method: "POST",
    headers: { cookie: as, "content-type": "application/json" },
    body: JSON.stringify({ action, args }),
  })).json();

const saved = await callAction("saveDraft", [id, 1, draft]);
check("saving a draft succeeds", saved?.ok === true, JSON.stringify(saved).slice(0, 120));

const state1 = await (await fetch(`${B}/api/dev?id=${id}`, { headers: { cookie } })).json();
// 1 x 1,00,000 + 1.5 x 20,000 = 1,30,000 taxable; IGST 18% = 23,400; total 1,53,400
check("stored subtotal equals the calculator", state1.subtotalMinor === 13000000, `got ${state1.subtotalMinor}`);
check("stored tax equals the calculator", state1.taxMinor === 2340000, `got ${state1.taxMinor}`);
check("stored total equals the calculator", state1.totalMinor === 15340000, `got ${state1.totalMinor}`);
check("the month follows the invoice date", state1.period === "2609", state1.period);

// -------------------------------------------------------- version guard
const stale = await callAction("saveDraft", [id, 1, { ...draft, notes: "second tab" }]);
check("a stale version is refused, not applied", stale?.ok === false && stale?.reason === "conflict", JSON.stringify(stale));
const afterStale = await (await fetch(`${B}/api/dev?id=${id}`, { headers: { cookie } })).json();
check("the refused save changed nothing", afterStale.notes === null, `notes=${afterStale.notes}`);

// -------------------------------------------------------- refuse to issue
const empty = await callAction("issueInvoice", [id, afterStale.version, { ...draft, lines: [] }]);
check("an invoice with no lines cannot be issued", empty?.ok === false, JSON.stringify(empty).slice(0, 120));

// ----------------------------------------------------------------- issue
const issued = await callAction("issueInvoice", [id, afterStale.version, draft]);
check("issuing succeeds after an edit", issued?.ok === true, JSON.stringify(issued).slice(0, 160));
check("the number is allocated from the invoice date's month", /^INV2609\d{3}$/.test(issued?.number ?? ""), issued?.number);

const again = await callAction("issueInvoice", [id, afterStale.version + 1, draft]);
check("issuing twice is refused", again?.ok === false, JSON.stringify(again).slice(0, 120));

// ---------------------------------------------------------------- viewer
const viewer = await login(env.TEST_VIEWER_EMAIL ?? "", env.TEST_VIEWER_PASSWORD ?? "");
if (viewer.includes("invoice_session")) {
  const denied = await callAction("saveDraft", [id, 99, draft], viewer);
  check("a VIEWER calling saveDraft directly is rejected", denied?.error === "forbidden", JSON.stringify(denied).slice(0, 120));
} else {
  console.log("SKIP  VIEWER check (set TEST_VIEWER_EMAIL / TEST_VIEWER_PASSWORD in .env)");
}

// ------------------------------------------------------------------- pdf
const pdf = Buffer.from(await (await fetch(`${B}/invoices/${id}/pdf`, { headers: { cookie } })).arrayBuffer());
check("the issued invoice renders a PDF", pdf.subarray(0, 5).toString() === "%PDF-", `${(pdf.length / 1024).toFixed(0)}KB`);

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall editor checks passed");
process.exit(failed ? 1 : 0);
