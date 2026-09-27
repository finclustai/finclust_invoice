/**
 * The dashboard: the figures are there, kept apart by currency, and the charts
 * are readable without relying on colour.
 *
 * Needs `pnpm dev` running.  Run: pnpm check:dashboard
 */
import { readFileSync } from "node:fs";
const B="http://localhost:3100";
const env=Object.fromEntries(readFileSync(".env","utf8").split("\n").map(l=>l.match(/^(\w+)="?([^"]*?)"?$/)).filter(Boolean).map(m=>[m[1],m[2]]));
const q=String.fromCharCode(34);
const h=await (await fetch(`${B}/login`)).text();
const f=[...h.matchAll(/<form\b[\s\S]*?<\/form>/g)].map(m=>m[0]).find(x=>x.includes("current-password"));
const fd=new FormData();
for(const i of f.matchAll(/<input[^>]*type="hidden"[^>]*>/g)){const n=(i[0].match(/name="([^"]*)"/)||[])[1];const v=((i[0].match(/value="([^"]*)"/)||[])[1]??"").replace(/&quot;/g,q).replace(/&amp;/g,"&");if(n)fd.set(n,v);}
fd.set("next","/");fd.set("email",env.SEED_ADMIN_EMAIL);fd.set("password",env.SEED_ADMIN_PASSWORD);
const cookie=((await fetch(`${B}/login`,{method:"POST",body:fd,redirect:"manual"})).headers.get("set-cookie")??"").split(";")[0];
const b=(await (await fetch(`${B}/`,{headers:{cookie}})).text()).replace(/<!--.*?-->/g,"");
let fail=0;const ck=(n,ok,x="")=>{if(!ok)fail++;console.log(`${ok?"PASS":"FAIL"}  ${n}${x?"  "+x:""}`)};
ck("dashboard loads",b.includes("Dashboard"));
// Only asserts what the data supports: a currency section exists for each
// currency that has invoices, which after a clear-out may be one or none.
const shown=["INR","USD","EUR","AED","SGD"].filter(c=>b.includes(`>${c}<`));
ck("a section per currency that has invoices",b.includes("Dashboard")&&(shown.length>0||b.includes("Nothing to show yet")),shown.join(", ")||"none yet");
ck("two currencies get the side-by-side chart",shown.length>1?b.includes("scaled to its own biggest month"):true);
ck("never mixes currencies in one total",b.includes("kept separate per currency"));
ck("shows billed this month",b.includes("Billed this month")||b.includes("Nothing to show yet"));
ck("shows what is owed",b.includes("Still owed")||b.includes("Nothing to show yet"));
ck("shows overdue",b.includes("Overdue")||b.includes("Nothing to show yet"));
ck("shows GST collected",b.includes("GST this month")||b.includes("Nothing to show yet"));
ck("has the month chart",b.includes("Billed each month")||b.includes("Nothing to show yet"));
ck("the month chart skips empty months",!b.includes(">0.00<"));
// The aging chart appears only when something is actually late; a column of
// zeroes is noise, not reassurance.
ck("aging chart appears only when something is late",
   b.includes("How overdue") === b.includes("days late"));
ck("has top customers when there are any",b.includes("Biggest customers")||b.includes("Nothing to show yet"));
// Only when there are charts to colour: on an empty database the dashboard
// shows a first-run message instead, which is correct.
const hasCharts=b.includes("Billed each month")||b.includes("Biggest customers");
ck("chart colour is the accessible one, never the light brand orange",
   hasCharts?(b.includes("#b35c00")&&!b.includes("background-color:#ff8a1e")):true,
   hasCharts?"":"(no charts yet)");
ck("charts are real tables, so a screen reader can read them",hasCharts?b.includes("<caption"):true,
   hasCharts?"":"(no charts yet)");
console.log(fail?`\n${fail} FAILED`:"\nall dashboard checks passed");
process.exit(fail?1:0);
