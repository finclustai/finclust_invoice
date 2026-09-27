/**
 * Creates a real Zoho draft from a real invoice, then checks what landed.
 *
 * It creates a draft and never sends, so running this is safe: the message
 * sits in the Drafts folder until a person presses send. It is deleted again
 * at the end unless KEEP_DRAFT=1.
 *
 * Needs `pnpm dev` running.  Run: pnpm check:send
 */
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
const check = (n, ok, x = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
};

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

const loginForm = await hiddenFields("/login", "current-password");
loginForm.set("next", "/");
loginForm.set("email", env.SEED_ADMIN_EMAIL);
loginForm.set("password", env.SEED_ADMIN_PASSWORD);
const cookie = ((await fetch(`${B}/login`, { method: "POST", body: loginForm, redirect: "manual" })).headers.get("set-cookie") ?? "").split(";")[0];
if (!cookie.includes("invoice_session")) throw new Error("login failed");

const call = async (action, args) =>
  (await fetch(`${B}/api/dev`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ action, args }),
  })).json();

const invoices = await (await fetch(`${B}/api/dev?what=index`, { headers: { cookie } })).json();
const issued = invoices.find((i) => i.number === "INV2608002");
check("an issued invoice to send", Boolean(issued), issued?.number);
if (!issued) process.exit(1);

// --------------------------------------------------------------- prefill
const client = await call("prepareSend", [issued.id, "client"]);
check("email is connected", client.enabled === true, client.mailbox ?? "");
check("it knows which mailbox it sends from", Boolean(client.mailbox), client.mailbox);
check("the customer's address is filled in", client.to.includes("hr@alsuminfotech.com"), JSON.stringify(client.to));
check("the subject names the invoice", client.subject.includes("INV2608002"), client.subject);
check("the message states the amount", client.html.includes("3,38,683.60"));

const ca = await call("prepareSend", [issued.id, "accountant"]);
check("the accountant gets different wording", ca.subject !== client.subject, ca.subject);
check("and no recipient, because you type theirs", ca.to.length === 0);

// ---------------------------------------------------------------- guards
const badTo = await call("sendInvoice", [issued.id, { to: "not-an-email", cc: "", subject: "x", html: "y" }]);
check("a malformed address is refused", badTo.ok === false, JSON.stringify(badTo.problems ?? []));

const noTo = await call("sendInvoice", [issued.id, { to: "", cc: "", subject: "x", html: "y" }]);
check("sending with no recipient is refused", noTo.ok === false);

const draftInvoice = invoices.find((i) => i.number.startsWith("DRAFT-"));
if (draftInvoice) {
  const tooEarly = await call("sendInvoice", [
    draftInvoice.id,
    { to: env.SEED_ADMIN_EMAIL, cc: "", subject: "x", html: "y" },
  ]);
  check("an unissued draft cannot be sent", tooEarly.ok === false, (tooEarly.problems ?? [])[0]);
}

// ------------------------------------------------------- the real thing
const sent = await call("sendInvoice", [
  issued.id,
  {
    to: env.SEED_ADMIN_EMAIL,
    cc: "",
    subject: `[check-send] Invoice ${issued.number}`,
    html: "<p>Automated check. Safe to delete.</p>",
  },
]);
check("a Zoho draft is created with the PDF attached", sent.ok === true, JSON.stringify(sent).slice(0, 160));
check("and it points at the drafts folder", String(sent.draftsUrl ?? "").includes("drafts"), sent.draftsUrl);

const timeline = await (await fetch(`${B}/api/dev?id=${issued.id}&what=timeline`, { headers: { cookie } })).json();
check("the send is recorded on the invoice's timeline", timeline.some((e) => e.kind === "sent"));

console.log(
  failed
    ? `\n${failed} check(s) FAILED`
    : `\nall send checks passed — a draft is waiting in ${client.mailbox}, delete it there`,
);
process.exit(failed ? 1 : 0);
