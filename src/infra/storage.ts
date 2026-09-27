import "server-only";

/*
 * Supabase Storage, over its REST API.
 *
 * Uses fetch rather than the Supabase client library: uploading, downloading
 * and deleting one object is three short calls, and the app never needs the
 * rest of that SDK. The key used here is the service key, so it bypasses row
 * security — it is server-side only and must never reach the browser.
 */

export class StorageNotConfigured extends Error {}
export class StorageFailed extends Error {}

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new StorageNotConfigured("File storage is not set up yet");
  return { url: url.replace(/\/$/, ""), key, bucket: process.env.SUPABASE_INVOICE_BUCKET ?? "invoices" };
}

export const storageConfigured = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

const auth = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}` });

export async function putObject(path: string, body: Buffer, contentType: string): Promise<void> {
  const { url, key, bucket } = config();
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
    method: "POST",
    headers: { ...auth(key), "Content-Type": contentType, "x-upsert": "true" },
    body: new Uint8Array(body),
  });
  if (!response.ok) {
    throw new StorageFailed(`Could not store the file: ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
}

export async function getObject(path: string): Promise<Buffer | null> {
  const { url, key, bucket } = config();
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
    headers: auth(key),
  });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new StorageFailed(`Could not read the file: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteObject(path: string): Promise<void> {
  const { url, key, bucket } = config();
  await fetch(`${url}/storage/v1/object/${bucket}/${encodeURI(path)}`, {
    method: "DELETE",
    headers: auth(key),
  });
}
