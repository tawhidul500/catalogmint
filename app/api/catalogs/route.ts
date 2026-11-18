import type { NextRequest } from "next/server";
import { BackupError, backupFailure, database, readCatalog, reply, sameOrigin, visitor } from "@/lib/server/cloud-catalogs";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sql = database(), owner = visitor(request);
    const key = request.nextUrl.searchParams.get("key");
    if (key) {
      const rows = await sql`SELECT catalog FROM catalogmint_catalogs
        WHERE visitor_hash = ${owner.hash} AND catalog_key = ${key}`;
      return reply(request, owner.token, { catalog: rows[0]?.catalog ?? null });
    }
    const offset = Number(request.nextUrl.searchParams.get("offset") || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new BackupError("Invalid history page.");
    const rows = await sql`SELECT catalog_key AS key, website AS site, imported_at AS date,
      product_count AS "productCount", updated_at AS "updatedAt"
      FROM catalogmint_catalogs WHERE visitor_hash = ${owner.hash}
      ORDER BY updated_at DESC, catalog_key LIMIT 51 OFFSET ${offset}`;
    return reply(request, owner.token, { items: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null });
  } catch (error) { return backupFailure(error); }
}

export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const sql = database(), owner = visitor(request), catalog = await readCatalog(request);
    const rows = await sql`INSERT INTO catalogmint_catalogs
      (visitor_hash, catalog_key, website, imported_at, product_count, catalog)
      VALUES (${owner.hash}, ${catalog.key}, ${catalog.site}, ${catalog.date}, ${catalog.products.length}, ${JSON.stringify(catalog)}::jsonb)
      ON CONFLICT (visitor_hash, catalog_key) DO UPDATE SET
        website = EXCLUDED.website, imported_at = EXCLUDED.imported_at,
        product_count = EXCLUDED.product_count, catalog = EXCLUDED.catalog, updated_at = now()
      RETURNING updated_at AS "updatedAt"`;
    return reply(request, owner.token, { saved: true, updatedAt: rows[0].updatedAt });
  } catch (error) { return backupFailure(error); }
}
