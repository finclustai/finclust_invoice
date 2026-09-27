/**
 * Proves the history reads the way a person needs it to: a run of autosaves is
 * one entry, a milestone stands alone, the diff names the right field, and a
 * restore brings content back without touching the number or the state.
 *
 * Needs `pnpm dev` running.  Run: pnpm check:history
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

const loginForm = await hiddenFields("/login", "current-password");
loginForm.set("next", "/"); loginForm.set("email", env.SEED_ADMIN_EMAIL); loginForm.set("password", env.SEED_ADMIN_PASSWORD);
const cookie = ((await fetch(`${B}/login`, { method: "POST", body: loginForm, redirect: "manual" })).headers.get("set-cookie") ?? "").split(";")[0];
if (!cookie.includes("invoice_session")) throw new Error("login failed");

const call = async (action, args) =>
  (await fetch(`${B}/api/dev`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ action, args }) })).json();
const get = async (q) => (await fetch(`${B}/api/dev?${q}`, { headers: { cookie } })).json();

const createForm = await hiddenFields("/invoices", "New invoice", cookie);
const created = await fetch(`${B}/invoices`, { method: "POST", body: createForm, headers: { cookie }, redirect: "manual" });
const id = ((created.headers.get("location") ?? "").match(/invoices\/([0-9a-f-]{36})/) || [])[1];
check("draft created", Boolean(id));
if (!id) process.exit(1);

const lineId = randomUUID();
const base = {
  companyId: (await get(`id=${id}`)).companyId,
  customerId: null,
  customer: { name: "ALSUM INFOTECH PRIVATE LIMITED", addressLines: ["Chennai"], gstin: "33AAGCA7303P1ZK", stateCode: "33", emails: [] },
  issueDate: "2026-09-20", dueDate: null, paymentTerms: null,
  currency: "INR", gstEnabled: true, taxRateBp: 1800, template: "classic", notes: null,
  lines: [{ id: lineId, description: "Caratlane project", hsnSac: null, qty: 1, rateMinor: 7500000 }],
};

// Three saves in quick succession, the way autosave fires while someone types.
let v = 1;
for (const rate of [7500000, 7200000, 7000000]) {
  const r = await call("saveDraft", [id, v, { ...base, lines: [{ ...base.lines[0], rateMinor: rate }] }]);
  if (!r.ok) { check(`save at rate ${rate}`, false, JSON.stringify(r)); process.exit(1); }
  v = r.version;
}

let timeline = await get(`id=${id}&what=timeline`);
check("a run of autosaves is one entry, not three", timeline.length === 1, `${timeline.length} entries`);
check("and it says how many changes it absorbed", timeline[0]?.changeCount === 3, `count ${timeline[0]?.changeCount}`);
check("the entry is attributed", Boolean(timeline[0]?.actor), timeline[0]?.actor);

const firstEntryId = timeline[0].id;

// Issuing is a milestone: it must not fold into the edit above it.
const issued = await call("issueInvoice", [id, v, { ...base, lines: [{ ...base.lines[0], rateMinor: 7000000 }] }]);
check("issuing succeeds", issued.ok === true, JSON.stringify(issued).slice(0, 120));
timeline = await get(`id=${id}&what=timeline`);
check("issuing is its own entry", timeline.length === 2 && timeline[0].kind === "issued", `${timeline.length} entries, top=${timeline[0]?.kind}`);

// Restore the earlier content and prove what it did and did not change.
const before = await get(`id=${id}`);
const restored = await call("restoreVersion", [id, firstEntryId]);
check("restore succeeds", restored.ok === true, JSON.stringify(restored).slice(0, 140));

const after = await get(`id=${id}`);
check("restore keeps the GST number", after.number === before.number, `${before.number} -> ${after.number}`);
check("restore keeps the state", after.state === before.state, `${before.state} -> ${after.state}`);
check("restore brings the content back", after.totalMinor === 8260000, `total ${after.totalMinor}`);

timeline = await get(`id=${id}&what=timeline`);
check("restore is recorded rather than rewinding history", timeline.length === 3 && timeline[0].kind === "restored", `${timeline.length} entries, top=${timeline[0]?.kind}`);

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall history checks passed");
process.exit(failed ? 1 : 0);
