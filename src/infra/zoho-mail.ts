import "server-only";

/*
 * The company Zoho mailbox, reached with a refresh token.
 *
 * Ported from the career site (E:\sudheer\apps\api\src\applications\zoho-mail.ts),
 * which chose this because FINCLUST is on Zoho's free plan — no SMTP, no IMAP.
 *
 * It creates drafts and never sends. A person opens Zoho Mail, reads what is
 * about to go out, and presses send. For an invoice that is the right shape:
 * the last look before a document reaches a client should be a human's.
 */

type ZohoBody = {
  status?: { code?: number };
  // Zoho's JSON differs per endpoint; only a few fields are ever read.
  data?: Record<string, unknown> & { moreInfo?: string };
  access_token?: string;
  expires_in?: number;
};

export interface ZohoAttachment {
  storeName: string;
  attachmentPath: string;
  attachmentName: string;
}

export class ZohoNotConfigured extends Error {}
export class ZohoRefused extends Error {}

function config() {
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
  if (!refreshToken) throw new ZohoNotConfigured("Sending by email is not set up yet");
  return {
    accountsUrl: process.env.ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.in",
    mailApiUrl: process.env.ZOHO_MAIL_API_URL ?? "https://mail.zoho.in",
    clientId: process.env.ZOHO_CLIENT_ID ?? "",
    clientSecret: process.env.ZOHO_CLIENT_SECRET ?? "",
    refreshToken,
  };
}

export const zohoConfigured = () => Boolean(process.env.ZOHO_REFRESH_TOKEN);
export const draftsUrl = () => `${config().mailApiUrl}/zm/#mail/folder/drafts`;

// Cached per warm server instance; Zoho access tokens last an hour.
let token: { value: string; expiresAt: number } | null = null;
let account: { id: string; email: string } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const { accountsUrl, clientId, clientSecret, refreshToken } = config();
  const response = await fetch(`${accountsUrl}/oauth/v2/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as ZohoBody;
  if (!body.access_token) {
    console.error("[zoho] token refresh failed:", JSON.stringify(body).slice(0, 300));
    throw new ZohoRefused("The Zoho Mail connection needs renewing. Ask an admin to reconnect it.");
  }
  token = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function call(path: string, init: RequestInit = {}): Promise<ZohoBody> {
  const response = await fetch(`${config().mailApiUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Zoho-oauthtoken ${await accessToken()}`,
    },
  });
  const body = (await response.json().catch(() => ({}))) as ZohoBody;
  if (!response.ok || (body.status?.code && body.status.code !== 200)) {
    console.error(`[zoho] ${path.split("?")[0]} failed:`, response.status, JSON.stringify(body).slice(0, 400));
    // Force a fresh token next time rather than retrying a rejected one.
    if (response.status === 401) token = null;
    throw new ZohoRefused(
      `Zoho Mail refused the request${body.data?.moreInfo ? `: ${body.data.moreInfo}` : ""}.`,
    );
  }
  return body;
}

async function getAccount() {
  if (account) return account;
  const body = await call("/api/accounts");
  const first = (body.data as unknown as Record<string, string>[] | undefined)?.[0];
  if (!first) throw new ZohoRefused("The Zoho mailbox could not be found.");
  account = {
    id: String(first.accountId),
    email: String(first.primaryEmailAddress ?? first.mailboxAddress),
  };
  return account;
}

export async function mailboxAddress(): Promise<string> {
  return (await getAccount()).email;
}

export async function uploadAttachment(file: Buffer, fileName: string): Promise<ZohoAttachment> {
  const { id } = await getAccount();
  const body = await call(
    `/api/accounts/${id}/messages/attachments?fileName=${encodeURIComponent(fileName)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(file),
    },
  );
  const data = (Array.isArray(body.data) ? body.data[0] : body.data) as unknown as ZohoAttachment;
  return {
    storeName: data.storeName,
    attachmentPath: data.attachmentPath,
    attachmentName: data.attachmentName,
  };
}

export async function createDraft(draft: {
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  attachments: ZohoAttachment[];
}): Promise<{ messageId: string | null; from: string }> {
  const { id, email } = await getAccount();
  const body = await call(`/api/accounts/${id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "draft",
      fromAddress: email,
      toAddress: draft.to.join(","),
      ...(draft.cc.length ? { ccAddress: draft.cc.join(",") } : {}),
      subject: draft.subject,
      content: draft.html,
      mailFormat: "html",
      attachments: draft.attachments,
    }),
  });
  return { messageId: String(body.data?.messageId ?? "") || null, from: email };
}
