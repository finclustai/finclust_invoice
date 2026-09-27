/**
 * Proves the multi-company promise: switching which of your companies an
 * invoice is billed from changes the GST treatment AND the bank details the
 * customer is told to pay into.
 *
 * Needs `pnpm dev` running and a second company in another state.
 * Run: pnpm check:companies
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
const B="http://localhost:3100";
const env=Object.fromEntries(readFileSync(".env","utf8").split("\n").map(l=>l.match(/^(\w+)="?([^"]*?)"?$/)).filter(Boolean).map(m=>[m[1],m[2]]));
const q=String.fromCharCode(34);
async function fields(path,marker,cookie){const h=await (await fetch(`${B}${path}`,{headers:cookie?{cookie}:{}})).text();
 const f=[...h.matchAll(/<form\b[\s\S]*?<\/form>/g)].map(m=>m[0]).find(x=>x.includes(marker));
 const fd=new FormData();
 for(const i of f.matchAll(/<input[^>]*type="hidden"[^>]*>/g)){const n=(i[0].match(/name="([^"]*)"/)||[])[1];const v=((i[0].match(/value="([^"]*)"/)||[])[1]??"").replace(/&quot;/g,q).replace(/&amp;/g,"&");if(n)fd.set(n,v);}
 return fd;}
function pdfText(buf){const out=[];for(const b of buf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)){let s=b[1];try{s=inflateSync(Buffer.from(s,"latin1")).toString("latin1")}catch{continue}
 for(const t of s.matchAll(/\[([^\]]*)\]\s*TJ/g)){let l="";for(const h of t[1].matchAll(/<([0-9A-Fa-f]*)>/g))l+=Buffer.from(h[1],"hex").toString("latin1");if(l.trim())out.push(l)}}return out.join("\n")}
const lf=await fields("/login","current-password");lf.set("next","/");lf.set("email",env.SEED_ADMIN_EMAIL);lf.set("password",env.SEED_ADMIN_PASSWORD);
const cookie=((await fetch(`${B}/login`,{method:"POST",body:lf,redirect:"manual"})).headers.get("set-cookie")??"").split(";")[0];
let fail=0;const ck=(n,ok,x="")=>{if(!ok)fail++;console.log(`${ok?"PASS":"FAIL"}  ${n}${x?"  "+x:""}`)};
const call=async(a,args)=>(await fetch(`${B}/api/dev`,{method:"POST",headers:{cookie,"content-type":"application/json"},body:JSON.stringify({action:a,args})})).json();

const cf=await fields("/invoices","New invoice",cookie);
const created=await fetch(`${B}/invoices`,{method:"POST",body:cf,headers:{cookie},redirect:"manual"});
const id=((created.headers.get("location")??"").match(/invoices\/([0-9a-f-]{36})/)||[])[1];
const st=await (await fetch(`${B}/api/dev?id=${id}`,{headers:{cookie}})).json();

const ed=(await (await fetch(`${B}/invoices/${id}`,{headers:{cookie}})).text()).replace(/<!--.*?-->/g,"");
ck("the company picker appears now there are two",ed.includes("Invoice from"));
ck("and lists both companies",ed.includes("FINCLUST PRIVATE LIMITED")&&ed.includes("FINCLUST CHENNAI LLP"));

// A Tamil Nadu customer, billed first from Karnataka then from Tamil Nadu.
const base={companyId:st.companyId,customerId:null,
 customer:{name:"ALSUM INFOTECH PRIVATE LIMITED",addressLines:["Chennai"],gstin:"33AAGCA7303P1ZK",stateCode:"33",emails:[]},
 issueDate:"2026-09-25",dueDate:null,paymentTerms:null,currency:"INR",gstEnabled:true,taxRateBp:1800,template:"classic",notes:null,
 lines:[{id:randomUUID(),description:"Consulting",hsnSac:null,qty:1,rateMinor:10000000}]};

let r=await call("saveDraft",[id,1,base]);
ck("saved billing from Karnataka",r.ok===true,JSON.stringify(r).slice(0,90));
let pdf=pdfText(Buffer.from(await (await fetch(`${B}/invoices/${id}/pdf`,{headers:{cookie}})).arrayBuffer()));
ck("Karnataka seller -> IGST (different states)",pdf.includes("IGST")&&!pdf.includes("CGST"));
ck("and prints the IndusInd bank",pdf.includes("IndusInd"));

const sellers=await (await fetch(`${B}/api/dev?what=companies`,{headers:{cookie}})).json();
const chennai=(sellers.find(c=>c.stateCode==="33")??{}).id;
if(!chennai){console.log("SKIP  no second company in another state — add one at /settings/companies");process.exit(0);}
r=await call("saveDraft",[id,r.version,{...base,companyId:chennai}]);
ck("switched the invoice to the Chennai company",r.ok===true,JSON.stringify(r).slice(0,90));
pdf=pdfText(Buffer.from(await (await fetch(`${B}/invoices/${id}/pdf`,{headers:{cookie}})).arrayBuffer()));
ck("Tamil Nadu seller -> CGST + SGST (same state)",pdf.includes("CGST")&&pdf.includes("SGST")&&!pdf.includes("IGST"));
ck("and the bank details follow the company",pdf.includes("HDFC")&&!pdf.includes("IndusInd"));
ck("the total is unchanged at 18% either way",pdf.includes("INR 1,18,000.00"),pdf.match(/INR [\d,.]+/g)?.slice(-1)[0]);
console.log(fail?`\n${fail} FAILED`:"\nall multi-company checks passed");
process.exit(fail?1:0);
