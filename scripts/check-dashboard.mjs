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
ck("splits by currency",b.includes(">INR<")&&b.includes(">USD<"));
ck("never mixes currencies in one total",b.includes("kept separate per currency"));
ck("shows billed this month",b.includes("Billed this month"));
ck("shows what is owed",b.includes("Still owed"));
ck("shows overdue",b.includes("Overdue"));
ck("shows GST collected",b.includes("GST this month"));
ck("has the twelve-month chart",b.includes("Billed each month"));
ck("has the aging chart",b.includes("How overdue"));
ck("has top customers",b.includes("Biggest customers")&&b.includes("ALSUM"));
ck("uses the accessible data colour, not the light brand orange",b.includes("#b35c00")&&!b.includes("background-color:#ff8a1e"));
ck("charts are real tables, so a screen reader can read them",b.includes("<caption"));
console.log(fail?`\n${fail} FAILED`:"\nall dashboard checks passed");
process.exit(fail?1:0);
