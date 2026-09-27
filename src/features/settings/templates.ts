"use server";

import { revalidatePath } from "next/cache";
import {
  DEFAULT_TEMPLATES,
  type Audience,
  type EmailTemplate,
} from "@/domain/invoice/email";
import { requireUser } from "@/features/auth/current-user";
import { db } from "@/infra/db";

const KEY = "email_templates";

export interface TemplateFormState {
  error?: string;
  saved?: boolean;
}

/**
 * The wording the send dialog starts from.
 *
 * Falls back to the built-in text rather than failing, so a fresh install and
 * a half-saved settings row both still send something sensible.
 */
export async function loadTemplates(): Promise<Record<Audience, EmailTemplate>> {
  const row = await db.setting.findUnique({ where: { key: KEY }, select: { value: true } });
  const stored = (row?.value ?? {}) as Partial<Record<Audience, Partial<EmailTemplate>>>;
  return {
    client: {
      subject: stored.client?.subject?.trim() || DEFAULT_TEMPLATES.client.subject,
      body: stored.client?.body?.trim() || DEFAULT_TEMPLATES.client.body,
    },
    accountant: {
      subject: stored.accountant?.subject?.trim() || DEFAULT_TEMPLATES.accountant.subject,
      body: stored.accountant?.body?.trim() || DEFAULT_TEMPLATES.accountant.body,
    },
  };
}

/** Unbound, with the fields in the form, like the other forms in the app. */
export async function saveTemplates(
  _prev: TemplateFormState,
  form: FormData,
): Promise<TemplateFormState> {
  const user = await requireUser("admin");
  const text = (k: string) => String(form.get(k) ?? "").trim();

  const value: Record<Audience, EmailTemplate> = {
    client: { subject: text("clientSubject"), body: text("clientBody") },
    accountant: { subject: text("accountantSubject"), body: text("accountantBody") },
  };

  for (const [audience, template] of Object.entries(value)) {
    if (!template.subject) return { error: `The ${audience} subject can’t be empty` };
    if (!template.body) return { error: `The ${audience} message can’t be empty` };
    if (template.subject.length > 300) return { error: `The ${audience} subject is too long` };
    if (template.body.length > 20_000) return { error: `The ${audience} message is too long` };
  }

  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  await db.activityLog.create({
    data: { actorId: user.id, entity: "settings", entityId: KEY, action: "edited" },
  });

  revalidatePath("/settings/templates");
  return { saved: true };
}

/** Puts the built-in wording back, for when an edit has gone wrong. */
export async function resetTemplates(): Promise<void> {
  const user = await requireUser("admin");
  await db.setting.deleteMany({ where: { key: KEY } });
  await db.activityLog.create({
    data: { actorId: user.id, entity: "settings", entityId: KEY, action: "reset" },
  });
  revalidatePath("/settings/templates");
}
