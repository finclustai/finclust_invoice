/**
 * Makes a shareable link for an invoice and checks what it actually does:
 * opens the PDF without a login, counts opens, and stops working once revoked.
 * Then builds the month's pack for the accountant.
 *
 * Needs `pnpm dev` running.  Run: pnpm check:share
 */
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

const invoices = await (await fetch(`${B}/api/dev?what=index`, { headers: { cookie } })).json();
const issued = invoices.find((i) => i.number === "INV2608002");
check("an issued invoice to share", Boolean(issued));
if (!issued) process.exit(1);

// ------------------------------------------------------------------ share
const shared = await call("shareInvoice", [issued.id]);
check("a link is created", shared.ok === true, JSON.stringify(shared).slice(0, 140));
if (!shared.ok) { console.log("\ncannot continue"); process.exit(1); }
const token = shared.url.split("/p/")[1];
check("the token is long enough not to be guessed", token.length >= 30, `${token.length} chars`);
check("the message names the invoice and the amount", shared.message.includes("INV2608002") && shared.message.includes("3,38,683.60"));

// The whole point: it opens with no cookie at all.
const anon = await fetch(`${B}/p/${token}`);
const bytes = Buffer.from(await anon.arrayBuffer());
check("it opens without signing in", anon.status === 200 && bytes.subarray(0, 5).toString() === "%PDF-", `${anon.status}, ${(bytes.length / 1024).toFixed(0)}KB`);
check("it is served inline, not as a download", (anon.headers.get("content-disposition") ?? "").startsWith("inline"));
check("and is not cached by proxies", (anon.headers.get("cache-control") ?? "").includes("no-store"));
check("search engines are told to stay away", Boolean(anon.headers.get("x-robots-tag")));

const bogus = await fetch(`${B}/p/definitely-not-a-real-token-aaaaaaaa`);
check("a made-up token is refused", bogus.status === 404);

const links = await call("listShareLinks", [issued.id]);
check("the open was counted", (links[0]?.openCount ?? 0) >= 1, `${links[0]?.openCount} opens`);

await call("revokeShareLink", [token]);
check("a revoked link stops working", (await fetch(`${B}/p/${token}`)).status === 404);

// ----------------------------------------------------------------- CA pack
const preview = await call("previewPack", ["2608"]);
check("the month's pack is previewed before anything is built", preview.count >= 2, `${preview.count} invoices`);

const noTo = await call("buildCaPack", ["2608", { to: "", cc: "" }]);
check("it refuses to build without a recipient", noTo.ok === false);

const pack = await call("buildCaPack", ["2608", { to: env.SEED_ADMIN_EMAIL, cc: "" }]);
check("the pack becomes a Zoho draft", pack.ok === true, JSON.stringify(pack).slice(0, 140));
check("every invoice in the month is attached", (pack.attached ?? 0) >= preview.count, `${pack.attached} attached`);

const empty = await call("buildCaPack", ["9912", { to: env.SEED_ADMIN_EMAIL, cc: "" }]);
check("an empty month says so rather than sending nothing", empty.ok === false, (empty.problems ?? [])[0]);

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall share checks passed — a CA pack draft is waiting in Zoho, delete it there");
process.exit(failed ? 1 : 0);
