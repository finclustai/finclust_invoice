// End-to-end login checks against a running dev server (pnpm dev).
// Covers what unit tests cannot: the server action, the cookie, and the
// per-IP throttle, which lives behind next/headers.
import { readFileSync } from "node:fs";
const B = process.env.BASE_URL ?? "http://localhost:3100";
const creds = Object.fromEntries(
  readFileSync(".env", "utf8").split("\n").map((l) => l.match(/^(\w+)="?([^"]*?)"?$/)).filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

// Replay the form as a browser with JS disabled does: Next renders hidden
// $ACTION_* inputs for progressive enhancement.
async function attempt(email, password, ip) {
  const html = await (await fetch(`${B}/login`)).text();
  const fd = new FormData();
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const name = (m[0].match(/name="([^"]*)"/) || [])[1];
    const value = ((m[0].match(/value="([^"]*)"/) || [])[1] ?? "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    if (name) fd.set(name, value);
  }
  fd.set("next", "/"); fd.set("email", email); fd.set("password", password);
  return fetch(`${B}/login`, { method: "POST", body: fd, redirect: "manual", headers: { "x-forwarded-for": ip } });
}
const ATTACKER = "203.0.113.9";
const STAFF = "198.51.100.4";
let failed = 0;
const check = (name, ok, extra = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra && "  " + extra}`); };

const bad = await attempt(creds.SEED_ADMIN_EMAIL, "definitely-wrong-xyz", STAFF);
check("wrong password rejected", (await bad.text()).includes("incorrect"));

const good = await attempt(creds.SEED_ADMIN_EMAIL, creds.SEED_ADMIN_PASSWORD, STAFF);
const sc = good.headers.get("set-cookie") ?? "";
check("correct password sets httpOnly SameSite=Lax cookie",
  /invoice_session=/.test(sc) && /HttpOnly/i.test(sc) && /SameSite=Lax/i.test(sc), `status ${good.status}`);

const cookie = sc.split(";")[0];
const home = await fetch(`${B}/`, { headers: { cookie }, redirect: "manual" });
const body = await home.text();
check("authenticated home shows the user and role", home.status === 200 && body.includes("ADMIN") && body.includes("Sign out"));

check("unauthenticated request is redirected to login",
  (await fetch(`${B}/`, { redirect: "manual" })).headers.get("location")?.includes("/login") ?? false);

// The throttle must stop a brute-forcer WITHOUT locking out the real admin,
// who is the whole point: the limit is keyed on the caller's address.
for (let i = 0; i < 12; i++) await attempt(creds.SEED_ADMIN_EMAIL, `guess-${i}`, ATTACKER);
const throttled = await (await attempt(creds.SEED_ADMIN_EMAIL, "guess", ATTACKER)).text();
check("attacker IP is throttled", throttled.includes("Too many attempts"));

const staffLogin = await attempt(creds.SEED_ADMIN_EMAIL, creds.SEED_ADMIN_PASSWORD, STAFF);
check("real admin at another IP is NOT locked out",
  /invoice_session=/.test(staffLogin.headers.get("set-cookie") ?? ""), `status ${staffLogin.status}`);

const out = await fetch(`${B}/logout`, { method: "POST", headers: { cookie }, redirect: "manual" });
check("logout clears the cookie", out.status === 303 && /Max-Age=0|invoice_session=;/i.test(out.headers.get("set-cookie") ?? ""));

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
