"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { GSTIN_PATTERN, stateCodeFromGstin } from "@/domain/invoice/schema";
import { GST_STATES, stateName } from "@/domain/invoice/state-codes";
import { saveCompany, type CompanyFormState } from "./actions";

export interface CompanyRow {
  id: string;
  name: string;
  addressLines: string[];
  email: string | null;
  phone: string | null;
  gstin: string | null;
  stateCode: string;
  lut: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  bankBranch: string | null;
}

export function CompanyForm({ company }: { company?: CompanyRow }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<CompanyFormState, FormData>(saveCompany, {});
  const [gstin, setGstin] = useState(company?.gstin ?? "");
  const [stateCode, setStateCode] = useState(company?.stateCode ?? "29");

  // The GSTIN carries the state it was issued in; letting the two differ makes
  // every invoice from this company pick the wrong side of the CGST/IGST test.
  const derived = GSTIN_PATTERN.test(gstin.toUpperCase()) ? stateCodeFromGstin(gstin.toUpperCase()) : null;
  useEffect(() => {
    if (derived) setStateCode(derived);
  }, [derived]);

  useEffect(() => {
    if (state.savedId) router.push("/settings/companies");
  }, [state.savedId, router]);

  const error = (f: string) => state.errors?.[f];

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={company?.id ?? ""} />

      <section className="card space-y-4 p-4">
        <h2 className="label mb-0">Printed at the top of the invoice</h2>
        <Field label="Name" error={error("name")}>
          <input className="field" name="name" defaultValue={company?.name} required autoFocus />
        </Field>
        <Field label="Address" hint="One line per line" error={error("address")}>
          <textarea className="field min-h-20" name="address" rows={3} defaultValue={company?.addressLines.join("\n")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" error={error("email")}>
            <input className="field" name="email" type="email" defaultValue={company?.email ?? ""} />
          </Field>
          <Field label="Phone" error={error("phone")}>
            <input className="field" name="phone" defaultValue={company?.phone ?? ""} />
          </Field>
        </div>
      </section>

      <section className="card space-y-4 p-4">
        <h2 className="label mb-0">Tax</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GSTIN" error={error("gstin")}>
            <input
              className="field font-mono uppercase"
              name="gstin"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              maxLength={15}
              placeholder="29AAGCF2643D1ZS"
            />
          </Field>
          <Field
            label="Registered in"
            hint={
              derived
                ? `Set from the GSTIN: ${stateName(derived) ?? derived}`
                : "Decides CGST + SGST versus IGST on every invoice"
            }
            error={error("stateCode")}
          >
            <select
              className="field"
              name="stateCode"
              value={stateCode}
              disabled={Boolean(derived)}
              onChange={(e) => setStateCode(e.target.value)}
            >
              {GST_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
            {/* A disabled select submits nothing. */}
            {derived && <input type="hidden" name="stateCode" value={derived} />}
          </Field>
        </div>
        <Field label="LUT number" hint="Printed on export invoices, under the no-IGST declaration" error={error("lut")}>
          <input className="field font-mono sm:w-72" name="lut" defaultValue={company?.lut ?? ""} placeholder="AD290625019128X" />
        </Field>
      </section>

      <section className="card space-y-4 p-4">
        <h2 className="label mb-0">Payment details on the invoice</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bank" error={error("bankName")}>
            <input className="field" name="bankName" defaultValue={company?.bankName ?? ""} />
          </Field>
          <Field label="Branch" error={error("bankBranch")}>
            <input className="field" name="bankBranch" defaultValue={company?.bankBranch ?? ""} />
          </Field>
          <Field label="Account number" error={error("bankAccount")}>
            <input className="field font-mono" name="bankAccount" defaultValue={company?.bankAccount ?? ""} />
          </Field>
          <Field label="IFSC" error={error("bankIfsc")}>
            <input className="field font-mono uppercase" name="bankIfsc" defaultValue={company?.bankIfsc ?? ""} />
          </Field>
        </div>
      </section>

      {state.errors?.form && (
        <p role="alert" className="error-line">
          {state.errors.form}
        </p>
      )}

      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>
          {pending && <Loader2 size={15} className="animate-spin" aria-hidden />}
          {pending ? "Saving…" : company ? "Save changes" : "Add company"}
        </button>
        <button type="button" className="btn" onClick={() => router.push("/settings/companies")}>
          Cancel
        </button>
      </div>

      {company && (
        <p className="hint">
          Invoices already issued keep the details they were printed with — changing these affects new invoices only.
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="hint text-red">
          {error}
        </span>
      ) : (
        hint && <span className="hint">{hint}</span>
      )}
    </label>
  );
}
