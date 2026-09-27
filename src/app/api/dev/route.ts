import { requireUser } from "@/features/auth/current-user";
import { AuthError } from "@/features/auth/permissions";
import { saveCustomer } from "@/features/customers/actions";
import { issueInvoice, restoreVersion, saveDraft } from "@/features/invoices/actions";
import { listPayments, markPaidInFull, recordPayment, removePayment } from "@/features/invoices/payments";
import { buildCaPack, previewPack } from "@/features/invoices/ca-pack";
import { prepareSend, sendInvoice } from "@/features/invoices/send";
import { listShareLinks, revokeShareLink, shareInvoice } from "@/features/invoices/share";
import { listTimeline } from "@/features/invoices/versions";
import { db } from "@/infra/db";

/**
 * Test hooks for scripts/check-*.mjs, so the editor's server actions can be
 * exercised end to end without driving a browser.
 *
 * Refused outright in production. Even so it authenticates every call and runs
 * the real actions, which do their own `requireUser` — this endpoint adds no
 * access of its own, it only saves the scripts from replaying React's
 * server-action wire format.
 */
/**
 * Two locks, not one. NODE_ENV alone is a single string away from shipping
 * this; the explicit opt-in means a production deploy would have to set a
 * variable named after exactly what it does.
 */
const DISABLED = process.env.NODE_ENV === "production" || process.env.ENABLE_DEV_TEST_HOOKS !== "1";

const ACTIONS = {
  saveDraft, issueInvoice, restoreVersion, prepareSend, sendInvoice,
  recordPayment, removePayment, markPaidInFull, listPayments,
  shareInvoice, revokeShareLink, listShareLinks, previewPack, buildCaPack,
} as const;

/** saveCustomer takes FormData, so the scripts send plain fields. */
async function saveCustomerFields(id: string | null, fields: Record<string, string>) {
  const form = new FormData();
  if (id) form.set("id", id);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return saveCustomer({}, form);
}

export async function GET(req: Request) {
  if (DISABLED) return new Response("Not found", { status: 404 });
  await requireUser("read");
  const url = new URL(req.url);

  if (url.searchParams.get("what") === "companies") {
    return Response.json(
      await db.company.findMany({ select: { id: true, name: true, stateCode: true } }),
    );
  }

  if (url.searchParams.get("what") === "index") {
    return Response.json(
      await db.invoice.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, number: true } }),
    );
  }

  const id = url.searchParams.get("id");
  if (!id) return new Response("id required", { status: 400 });

  if (url.searchParams.get("what") === "timeline") {
    return Response.json(await listTimeline(id));
  }
  const row = await db.invoice.findUnique({
    where: { id },
    select: {
      number: true, period: true, state: true, version: true, notes: true, companyId: true,
      subtotalMinor: true, taxMinor: true, totalMinor: true, paidMinor: true,
    },
  });
  if (!row) return new Response("Not found", { status: 404 });
  // BigInt does not survive JSON.stringify.
  return Response.json({
    ...row,
    subtotalMinor: Number(row.subtotalMinor),
    taxMinor: Number(row.taxMinor),
    totalMinor: Number(row.totalMinor),
    paidMinor: Number(row.paidMinor),
  });
}

export async function POST(req: Request) {
  if (DISABLED) return new Response("Not found", { status: 404 });
  const { action, args } = (await req.json()) as { action: keyof typeof ACTIONS; args: unknown[] };
  if (action === ("saveCustomer" as never)) {
    try {
      return Response.json(await saveCustomerFields(args[0] as string | null, args[1] as Record<string, string>));
    } catch (error) {
      if (error instanceof AuthError) return Response.json({ error: error.reason }, { status: 403 });
      throw error;
    }
  }
  const fn = ACTIONS[action];
  if (!fn) return new Response("unknown action", { status: 400 });
  try {
    // @ts-expect-error — the scripts pass the real argument shapes.
    return Response.json(await fn(...args));
  } catch (error) {
    if (error instanceof AuthError) return Response.json({ error: error.reason }, { status: 403 });
    throw error;
  }
}
