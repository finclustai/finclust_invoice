import { db } from "@/infra/db";
import { getObject } from "@/infra/storage";

/**
 * A shared invoice, opened without signing in.
 *
 * Deliberately outside the authenticated part of the app: the point of the
 * link is that a customer can open it from WhatsApp. The long random token is
 * what protects it, so a wrong or revoked one says only "not found" — telling
 * the difference would confirm which tokens had once existed.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const link = await db.shareToken.findUnique({
    where: { token },
    select: {
      revokedAt: true,
      archive: { select: { storagePath: true, invoice: { select: { id: true, number: true } } } },
    },
  });
  if (!link || link.revokedAt) return notFound();

  const pdf = await getObject(link.archive.storagePath).catch(() => null);
  if (!pdf) return notFound();

  // Counted rather than logged per opener: the recipient is not a user here,
  // and an invoice link gets forwarded. Knowing it was opened is enough.
  await db.shareToken
    .update({ where: { token }, data: { openCount: { increment: 1 } } })
    .catch(() => undefined);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${link.archive.invoice.number}.pdf"`,
      // Not a public document: no proxy or CDN should keep a copy.
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function notFound() {
  return new Response("This link isn't valid any more.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}
