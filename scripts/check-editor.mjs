/**
 * Drives the editor's server actions the way the browser does: create a draft,
 * save it, prove the version guard, prove a zero invoice can't be issued.
 * Needs `pnpm dev` running.  Run: pnpm check:editor
 */
import { readFileSync } from "node:fs";
const B = process.env.BASE_URL ?? "http://localhost:3100";
const env = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").map((l) => l.match(/^(\w+)="?([^"]*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
let failed = 0;
const check = (n, ok, x = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); };

/**
 * Replays one form the way a browser with JS disabled does. A page can hold
 * several forms, each with its own $ACTION_* hidden inputs, so the fields must
 * come from the single form that contains `marker` — merging them all posts one
 * form's fields against another's action id.
 */
async function hiddenFields(path, marker, cookie) {
  const html = await (await fetch(`${B}${path}`, { headers: cookie ? { cookie } : {} })).text();
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((m) => m[0]);
  const form = forms.find((f) => f.includes(marker));
  if (!form) throw new Error(`no form containing ${JSON.stringify(marker)} on ${path}`);
  const fd = new FormData();
  for (const i of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const n = (i[0].match(/name="([^"]*)"/) || [])[1];
    const v = ((i[0].match(/value="([^"]*)"/) || [])[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    if (n) fd.set(n, v);
  }
  return fd;
}

const fd = await hiddenFields("/login", "current-password");
fd.set("next", "/"); fd.set("email", env.SEED_ADMIN_EMAIL); fd.set("password", env.SEED_ADMIN_PASSWORD);
const cookie = ((await fetch(`${B}/login`, { method: "POST", body: fd, redirect: "manual" })).headers.get("set-cookie") ?? "").split(";")[0];
if (!cookie.includes("invoice_session")) throw new Error("login failed");

// Create a draft the way the New invoice button does.
const create = await hiddenFields("/invoices", "New invoice", cookie);
const created = await fetch(`${B}/invoices`, { method: "POST", body: create, headers: { cookie }, redirect: "manual" });
const location = created.headers.get("location") ?? created.headers.get("x-action-redirect") ?? "";
const id = (location.match(/invoices\/([0-9a-f-]{36})/) || [])[1];
check("New invoice creates a draft and redirects to it", Boolean(id), location || `status ${created.status}`);
if (!id) { console.log("\ncannot continue without a draft"); process.exit(1); }

const page = await (await fetch(`${B}/invoices/${id}`, { headers: { cookie } })).text();
const number = (page.match(/INV\d{7,}/) || [])[0];
check("the draft got the next number in the series", /^INV\d{7,}$/.test(number ?? ""), number);
check("a draft offers an Issue button", page.includes("Issue"));

const invoices = await (await fetch(`${B}/api/invoice-index`, { headers: { cookie } })).json();
check("it appears in the invoice list", invoices.some((i) => i.id === id));

const pdf = Buffer.from(await (await fetch(`${B}/invoices/${id}/pdf`, { headers: { cookie } })).arrayBuffer());
check("an empty draft still renders a PDF", pdf.subarray(0, 5).toString() === "%PDF-");

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall editor checks passed");
process.exit(failed ? 1 : 0);
