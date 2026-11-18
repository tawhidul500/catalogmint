import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { neon } from "@neondatabase/serverless";
import { NextResponse, type NextRequest } from "next/server";
import type { Catalog } from "@/lib/catalog/types";

const cookieName = "catalogmint_visitor";
const maxUpload = 4_000_000;
const maxExpanded = 40_000_000;

export class BackupError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function database() {
  const connection = process.env.DATABASE_URL;
  if (!connection) throw new BackupError("Cloud backups are unavailable. Your catalogs are still saved in this browser.", 503);
  return neon(connection, { fetchOptions: { signal: AbortSignal.timeout(18_000) } });
}

export function sameOrigin(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    throw new BackupError("Open CatalogMint on this website to save a backup.", 403);
  }
}

export function visitor(request: NextRequest) {
  const value = request.cookies.get(cookieName)?.value;
  const token = value && /^[a-f0-9]{64}$/.test(value) ? value : randomBytes(32).toString("hex");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}

export function reply(request: NextRequest, token: string, data: unknown) {
  const json = JSON.stringify(data);
  const compressed = /\bgzip\b/.test(request.headers.get("accept-encoding") || "");
  const body = compressed ? new Uint8Array(gzipSync(json)) : json;
  // Vercel limits function responses. Large backups remain downloadable when gzip fits.
  if ((typeof body === "string" ? Buffer.byteLength(body) : body.byteLength) > maxUpload) {
    throw new BackupError("This backup is too large to restore in one response. Use your browser copy and export the catalog.", 413);
  }
  const response = new NextResponse(body, { headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-store",
    Vary: "Cookie, Accept-Encoding",
    ...(compressed ? { "Content-Encoding": "gzip" } : {}),
  } });
  response.cookies.set(cookieName, token, {
    httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:",
    path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export async function readCatalog(request: NextRequest): Promise<Catalog> {
  if (Number(request.headers.get("content-length")) > maxUpload) throw new BackupError("This backup exceeds the 4 MB upload limit.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new BackupError("Choose a catalog to back up.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > maxUpload) { await reader.cancel(); throw new BackupError("This backup exceeds the 4 MB upload limit.", 413); }
    chunks.push(part.value);
  }
  let bytes = Buffer.concat(chunks);
  const encoding = request.headers.get("content-encoding");
  if (encoding === "gzip") {
    try { bytes = gunzipSync(bytes, { maxOutputLength: maxExpanded }); }
    catch { throw new BackupError("The compressed backup is invalid or exceeds 40 MB when expanded.", 413); }
  } else if (encoding && encoding !== "identity") throw new BackupError("Unsupported backup encoding.", 415);

  let value: Catalog;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { throw new BackupError("The backup is not valid JSON."); }
  if (!value || typeof value !== "object" || !Array.isArray(value.products) ||
      typeof value.key !== "string" || typeof value.site !== "string" || value.key !== value.site ||
      value.site.length > 4096 || !/^https?:\/\//.test(value.site) ||
      typeof value.date !== "string" || !Number.isFinite(Date.parse(value.date)) ||
      typeof value.method !== "string" || !Number.isSafeInteger(value.skipped) || value.skipped < 0 ||
      typeof value.limited !== "boolean" || value.demo) throw new BackupError("Choose a valid imported catalog to back up.");
  const keys = ["id", "nameEn", "nameBn", "code", "codeType", "size", "category", "sourceUrl", "imageUrl"] as const;
  if (value.products.some(p => !p || typeof p !== "object" || keys.some(k => typeof p[k] !== "string" || p[k].length > 10_000))) {
    throw new BackupError("The backup contains invalid product details.");
  }
  return value;
}

export function backupFailure(error: unknown) {
  if (error instanceof BackupError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
  console.error("Catalog backup unavailable", code);
  return NextResponse.json({ error: "Cloud backups could not be reached. Your browser copy is still available." }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
