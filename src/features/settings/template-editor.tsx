"use client";

import { useActionState, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import {
  DEFAULT_TEMPLATES,
  PLACEHOLDER_HELP,
  fillTemplate,
  type Audience,
  type EmailTemplate,
} from "@/domain/invoice/email";
import { resetTemplates, saveTemplates, type TemplateFormState } from "./templates";

/** Filled in so the preview reads like a real message rather than braces. */
const SAMPLE = {
  invoice_number: "INV2609001",
  customer: "ALSUM INFOTECH PRIVATE LIMITED",
  company: "FINCLUST PRIVATE LIMITED",
  total: "INR 3,38,683.60",
  invoice_date: "September 1, 2026",
  due_date: "September 16, 2026",
  month: "September 2026",
  count: "6",
};

export function TemplateEditor({ templates }: { templates: Record<Audience, EmailTemplate> }) {
  const [state, action, pending] = useActionState<TemplateFormState, FormData>(saveTemplates, {});
  const [client, setClient] = useState(templates.client);
  const [accountant, setAccountant] = useState(templates.accountant);
  const [tab, setTab] = useState<Audience>("client");

  const current = tab === "client" ? client : accountant;
  const setCurrent = tab === "client" ? setClient : setAccountant;
  const preview = fillTemplate(current, SAMPLE);

  return (
    <form action={action} className="space-y-4">
      {/* Both templates post every time, so switching tabs never loses an edit. */}
      <input type="hidden" name="clientSubject" value={client.subject} />
      <input type="hidden" name="clientBody" value={client.body} />
      <input type="hidden" name="accountantSubject" value={accountant.subject} />
      <input type="hidden" name="accountantBody" value={accountant.body} />

      <div className="flex gap-1">
        {(
          [
            ["client", "To the customer"],
            ["accountant", "To the accountant"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`chip ${tab === value ? "bg-orange-tint text-ink" : "bg-sand text-body"}`}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="card space-y-3 p-4">
        <label className="block">
          <span className="label">Subject</span>
          <input
            className="field"
            value={current.subject}
            onChange={(e) => setCurrent({ ...current, subject: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="label">Message</span>
          <textarea
            className="field min-h-52"
            rows={12}
            value={current.body}
            onChange={(e) => setCurrent({ ...current, body: e.target.value })}
          />
          <span className="hint">
            A blank line starts a new paragraph. A paragraph mentioning something the invoice
            doesn’t have — a due date, say — is left out of that email.
          </span>
        </label>
      </section>

      <section className="card p-4">
        <h2 className="label">What you can drop in</h2>
        <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {Object.entries(PLACEHOLDER_HELP).map(([name, help]) => (
            <div key={name} className="flex gap-2">
              <dt>
                <button
                  type="button"
                  className="font-mono text-mid underline decoration-dotted"
                  title={`Add {${name}} to the message`}
                  onClick={() => setCurrent({ ...current, body: `${current.body}{${name}}` })}
                >
                  {`{${name}}`}
                </button>
              </dt>
              <dd className="text-mid">{help}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card p-4">
        <h2 className="label">Preview</h2>
        <p className="mb-2 text-sm font-semibold">{preview.subject}</p>
        <div
          className="prose-sm text-sm text-body"
          // Safe: fillTemplate escapes every value it substitutes, and the
          // surrounding text is typed by an admin who could edit this page anyway.
          dangerouslySetInnerHTML={{ __html: preview.html }}
        />
      </section>

      {state.error && (
        <p role="alert" className="error-line">
          {state.error}
        </p>
      )}
      {state.saved && <p className="text-sm text-green">Saved.</p>}

      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={pending}>
          {pending && <Loader2 size={15} className="animate-spin" aria-hidden />}
          Save templates
        </button>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={async () => {
            if (!confirm("Put the original wording back? Your changes will be lost.")) return;
            await resetTemplates();
            setClient(DEFAULT_TEMPLATES.client);
            setAccountant(DEFAULT_TEMPLATES.accountant);
          }}
        >
          <RotateCcw size={14} aria-hidden />
          Start over
        </button>
      </div>
    </form>
  );
}
