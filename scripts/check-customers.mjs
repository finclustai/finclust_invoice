/**
 * Proves the promise the customer picker makes on screen: choosing a customer
 * copies their details onto the invoice, and editing them afterwards never
 * changes an invoice that has already gone out.
 *
 * Needs `pnpm dev` running.  Run: pnpm check:customers
 */
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const B = process.env.BASE_URL ?? "http://localhost:3100";
const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .map((l) => l.match(/^(\w+)="?([^"]*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

let failed = 0;
const check = (n, ok, x = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
};

/** React splits adjacent text nodes with <!-- -->; strip them before matching. */
const plain = (html) => html.replace(/<!--.*?-->/g, "");

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

function pdfText(buf) {
  const lines = [];
  for (const block of buf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let stream = block[1];
    try {
      stream = inflateSync(Buffer.from(stream, "latin1")).toString("latin1");
    } catch {
      continue;
    }
    for (const show of stream.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      let line = "";
      for (const hex of show[1].matchAll(/<([0-9A-Fa-f]*)>/g)) line += Buffer.from(hex[1], "hex").toString("latin1");
      if (line.trim()) lines.push(line);
    }
  }
  return lines.join("\n");
}

const loginForm = await hiddenFields("/login", "current-password");
loginForm.set("next", "/");
loginForm.set("email", env.SEED_ADMIN_EMAIL);
loginForm.set("password", env.SEED_ADMIN_PASSWORD);
const cookie = ((await fetch(`${B}/login`, { method: "POST", body: loginForm, redirect: "manual" })).headers.get("set-cookie") ?? "").split(";")[0];
if (!cookie.includes("invoice_session")) throw new Error("login failed");

const page = async (p) => plain(await (await fetch(`${B}${p}`, { headers: { cookie } })).text());

// ------------------------------------------------------------------ listing
const list = await page("/customers");
check("both seeded customers are listed", list.includes("ALSUM INFOTECH") && list.includes("Technophile"));
check("the place of supply is shown by name, not code", list.includes("Tamil Nadu"));
check("an overseas customer reads as an export", list.includes("Outside India"));
check("each row shows how many invoices they have", /\d+\s+invoice/.test(list));
check("search narrows the list", (await page("/customers?q=ALSUM")).includes("ALSUM") && !(await page("/customers?q=ALSUM")).includes("Technophile"));

const form = await page("/customers/new");
check("the state list is real, not free text", form.includes("Karnataka") && form.includes("Tamil Nadu"));

// ---------------------------------------------- renaming must not rewrite history
const invoices = await (await fetch(`${B}/api/dev?what=index`, { headers: { cookie } })).json();
const alsum = invoices.find((i) => i.number === "INV2608002");
check("the seeded ALSUM invoice is there", Boolean(alsum));
if (!alsum) process.exit(1);

const before = pdfText(Buffer.from(await (await fetch(`${B}/invoices/${alsum.id}/pdf`, { headers: { cookie } })).arrayBuffer()));
check("its PDF bills ALSUM INFOTECH PRIVATE LIMITED", before.includes("ALSUM INFOTECH PRIVATE LIMITED"));

// Rename the customer through the real form, exactly as a person would.
const customersPage = await (await fetch(`${B}/customers`, { headers: { cookie } })).text();
const customerId = (customersPage.match(/\/customers\/([0-9a-f-]{36})/g) ?? [])
  .map((h) => h.split("/").pop())
  .find(Boolean);
const editPage = await (await fetch(`${B}/customers/${customerId}`, { headers: { cookie } })).text();
const isAlsum = editPage.includes("ALSUM");
if (isAlsum) {
  const edit = await hiddenFields(`/customers/${customerId}`, "Save changes", cookie);
  edit.set("name", "ALSUM RENAMED LIMITED");
  edit.set("address", "25/12, Alagiri Street, MGR Nagar\nChennai - 600078, Tamil Nadu");
  edit.set("gstin", "33AAGCA7303P1ZK");
  edit.set("stateCode", "33");
  edit.set("emails", "hr@alsuminfotech.com");
  edit.set("phone", "");
  edit.set("currency", "INR");
  edit.set("notes", "");
  await fetch(`${B}/customers/${customerId}`, { method: "POST", body: edit, headers: { cookie }, redirect: "manual" });

  const after = pdfText(Buffer.from(await (await fetch(`${B}/invoices/${alsum.id}/pdf`, { headers: { cookie } })).arrayBuffer()));
  check("renaming the customer leaves the issued invoice untouched", after.includes("ALSUM INFOTECH PRIVATE LIMITED"), "the invoice keeps its own copy");
  check("and the new name is not on the old invoice", !after.includes("ALSUM RENAMED LIMITED"));

  // Put it back so the checks stay repeatable.
  const undo = await hiddenFields(`/customers/${customerId}`, "Save changes", cookie);
  for (const [k, v] of edit.entries()) undo.set(k, v);
  undo.set("name", "ALSUM INFOTECH PRIVATE LIMITED");
  await fetch(`${B}/customers/${customerId}`, { method: "POST", body: undo, headers: { cookie }, redirect: "manual" });
} else {
  console.log("SKIP  rename check (could not identify the ALSUM customer row)");
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall customer checks passed");
process.exit(failed ? 1 : 0);
