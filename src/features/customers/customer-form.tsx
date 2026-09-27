"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { GSTIN_PATTERN, stateCodeFromGstin } from "@/domain/invoice/schema";
import { GST_STATES, stateName } from "@/domain/invoice/state-codes";
import { CURRENCY_CODES } from "@/domain/money/currency";
import { saveCustomer, type CustomerFormState } from "./actions";
import type { CustomerRow } from "./queries";

const OUTSIDE_INDIA = "";

export function CustomerForm({ customer }: { customer?: CustomerRow }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<CustomerFormState, FormData>(saveCustomer, {});

  const [gstin, setGstin] = useState(customer?.gstin ?? "");
  const [stateCode, setStateCode] = useState(customer?.stateCode ?? OUTSIDE_INDIA);

  // A GSTIN carries its own state in its first two digits, so once one is
  // entered the place of supply is not a choice — it is a fact, and letting
  // someone pick a different one only produces an invoice taxed wrongly.
  const derived = GSTIN_PATTERN.test(gstin.toUpperCase()) ? stateCodeFromGstin(gstin.toUpperCase()) : null;
  useEffect(() => {
    if (derived) setStateCode(derived);
  }, [derived]);

  useEffect(() => {
    if (state.savedId) router.push("/customers");
  }, [state.savedId, router]);

  const error = (field: string) => state.errors?.[field];

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={customer?.id ?? ""} />
      <section className="card space-y-4 p-4">
        <Field label="Name" error={error("name")}>
          <input className="field" name="name" defaultValue={customer?.name} required autoFocus />
        </Field>

        <Field label="Address" hint="One line per line" error={error("address")}>
          <textarea
            className="field min-h-20"
            name="address"
            rows={3}
            defaultValue={customer?.addressLines.join("\n")}
            placeholder={"25/12, Alagiri Street, MGR Nagar\nChennai - 600078, Tamil Nadu"}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GSTIN" hint="Leave empty for an unregistered or overseas customer" error={error("gstin")}>
            <input
              className="field font-mono uppercase"
              name="gstin"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="33AAGCA7303P1ZK"
              maxLength={15}
            />
          </Field>

          <Field
            label="Place of supply"
            hint={
              derived
                ? `Set from the GSTIN: ${stateName(derived) ?? derived}`
                : "“Outside India” makes the invoice an export under LUT"
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
              <option value={OUTSIDE_INDIA}>Outside India (export)</option>
              {GST_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
            {/* A disabled select submits nothing, so the derived value still has
                to reach the server. */}
            {derived && <input type="hidden" name="stateCode" value={derived} />}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Emails" hint="Comma separated" error={error("emails")}>
            <input className="field" name="emails" defaultValue={customer?.emails.join(", ")} />
          </Field>
          <Field label="Phone" hint="With country code, for WhatsApp" error={error("phone")}>
            <input className="field" name="phone" defaultValue={customer?.phone ?? ""} placeholder="+91 98765 43210" />
          </Field>
        </div>

        <Field label="Default currency" error={error("currency")}>
          <select className="field sm:w-40" name="currency" defaultValue={customer?.currency ?? "INR"}>
            {CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notes" hint="Only for you — never printed on the invoice" error={error("notes")}>
          <textarea className="field min-h-16" name="notes" rows={2} defaultValue={customer?.notes ?? ""} />
        </Field>
      </section>

      {state.errors?.form && (
        <p role="alert" className="error-line">
          {state.errors.form}
        </p>
      )}

      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>
          {pending && <Loader2 size={15} className="animate-spin" aria-hidden />}
          {pending ? "Saving…" : customer ? "Save changes" : "Add customer"}
        </button>
        <button type="button" className="btn" onClick={() => router.push("/customers")}>
          Cancel
        </button>
      </div>

      {customer && (
        <p className="hint">
          Changing these details won’t alter any invoice already created — each invoice keeps its own copy.
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
