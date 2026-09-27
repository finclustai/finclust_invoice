/**
 * Downloads every invoice through the real route and asserts what the PDF says.
 * Needs `pnpm dev` running.  Run: pnpm check:pdf
 *
 * Goes over HTTP rather than importing the renderer, for two reasons: it covers
 * auth and the route as well as the template, and @react-pdf's dependency tree
 * does not resolve under plain Node's CJS loader (only under Next's bundler).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateSync } from "node:zlib";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
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

/** Replays the login form the way a browser with JS disabled does. */
async function login() {
  const html = await (await fetch(`${BASE}/login`)).text();
  const form = new FormData();
  for (const input of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = (input[0].match(/name="([^"]*)"/) || [])[1];
    const value = ((input[0].match(/value="([^"]*)"/) || [])[1] ?? "")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
    if (name) form.set(name, value);
  }
  form.set("next", "/");
  form.set("email", env.SEED_ADMIN_EMAIL);
  form.set("password", env.SEED_ADMIN_PASSWORD);
  const res = await fetch(`${BASE}/login`, { method: "POST", body: form, redirect: "manual" });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  if (!cookie.includes("invoice_session")) throw new Error("login failed — check SEED_ADMIN_* in .env");
  return cookie;
}

/** @react-pdf writes text as [<hex> kern <hex> …] TJ, in the font's encoding. */
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
      for (const hex of show[1].matchAll(/<([0-9A-Fa-f]*)>/g)) {
        line += Buffer.from(hex[1], "hex").toString("latin1");
      }
      if (line.trim()) lines.push(line);
    }
  }
  return lines.join("\n");
}

const EXPECTED = {
  INV2608001: {
    must: [
      "INV2608001", "Technophile LLC", "USD 1,326.00", "1,326.00",
      "US Dollars One Thousand Three Hundred Twenty Six Only",
      "FINCLUST PRIVATE LIMITED", "Account No.: 257353000123",
    ],
    // "IGST" on its own appears in the export wording ("without payment of
    // IGST"); what must be absent is a charged tax row, which renders as "@".
    mustNot: ["IGST\n @ ", "CGST", "SGST", "₹"],
  },
  INV2608002: {
    must: [
      "INV2608002", "ALSUM INFOTECH PRIVATE LIMITED", "INR 3,38,683.60",
      "2,87,020.00", "IGST", "51,663.60", "33AAGCA7303P1ZK",
      "Rupees Three Lakh Thirty Eight Thousand Six Hundred Eighty Three and Sixty Paise Only",
    ],
    // The rupee sign is not in Helvetica's encoding; it would print as a blank box.
    mustNot: ["CGST", "SGST", "under LUT", "₹"],
  },
};

const cookie = await login();
const invoices = await (await fetch(`${BASE}/api/dev?what=index`, { headers: { cookie } })).json();
mkdirSync("tmp", { recursive: true });

for (const { id, number } of invoices) {
  const res = await fetch(`${BASE}/invoices/${id}/pdf`, { headers: { cookie } });
  const pdf = Buffer.from(await res.arrayBuffer());
  const valid = res.status === 200 && pdf.subarray(0, 5).toString() === "%PDF-";
  check(`${number}: renders`, valid, valid ? `${(pdf.length / 1024).toFixed(0)}KB` : `status ${res.status}`);
  if (!valid) continue;

  writeFileSync(`tmp/${number}.pdf`, pdf);
  check(
    `${number}: offered as a download named after the invoice`,
    (res.headers.get("content-disposition") ?? "").includes(`${number}.pdf`),
  );

  const expected = EXPECTED[number];
  if (!expected) continue;
  const text = pdfText(pdf);
  for (const phrase of expected.must) check(`${number}: says "${phrase}"`, text.includes(phrase));
  for (const phrase of expected.mustNot) {
    check(`${number}: does not say ${JSON.stringify(phrase)}`, !text.includes(phrase));
  }
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall PDF checks passed");
process.exit(failed ? 1 : 0);
