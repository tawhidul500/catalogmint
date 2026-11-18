import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { PGlite } from "@electric-sql/pglite";
import { neonConfig } from "@neondatabase/serverless";
import { NextRequest } from "next/server";
import { GET, POST } from "../app/api/catalogs/route";
import type { Catalog } from "../lib/catalog/types";

const db = new PGlite();
const origin = "https://catalogmint.example";
const previousUrl = process.env.DATABASE_URL;
const originalFetch = neonConfig.fetchFunction;
const sample: Catalog = {
  key: "https://shop.example/", site: "https://shop.example/", date: "2026-11-18T00:00:00Z",
  cursor: null, method: "Shopify", skipped: 0, limited: false,
  products: [{ id: "lux-1", nameEn: "Lux Soap", nameBn: "লাক্স সাবান", code: "08941100112233", codeType: "Barcode", size: "100 g", category: "Soap", sourceUrl: "https://shop.example/products/lux", imageUrl: "https://shop.example/lux.jpg" }],
};
before(async () => {
  await db.exec(await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"));
  process.env.DATABASE_URL = "postgresql://test:test@unit-test.neon.tech/test";
  // Execute the route's real parameterized SQL in PostgreSQL (PGlite), while
  // replacing only Neon's HTTP transport. No remote credentials are needed.
  neonConfig.fetchFunction = async (_url: string, options: RequestInit) => {
    const { query, params } = JSON.parse(String(options.body));
    try {
      const result = await db.query<unknown[]>(query, params, { rowMode: "array" });
      return Response.json({ ...result, rows: result.rows.map(row => row.map(value => value == null ? null : value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value))) });
    } catch (e) { return Response.json({ message: e instanceof Error ? e.message : "Database error" }, { status: 400 }); }
  };
});
after(async () => {
  neonConfig.fetchFunction = originalFetch;
  if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
  await db.close();
});

function request(path = "", cookie = "", init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("origin")) headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(origin + "/api/catalogs" + path, { ...init, signal: init.signal ?? undefined, headers });
}
function save(catalog: Catalog, cookie: string) {
  return POST(request("", cookie, { method: "POST", headers: { "content-encoding": "gzip", "content-type": "application/json" }, body: new Uint8Array(gzipSync(JSON.stringify(catalog))) }));
}
async function owner() {
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") || "", /HttpOnly/i);
  assert.match(response.headers.get("set-cookie") || "", /Secure/i);
  return response.headers.get("set-cookie")!.split(";")[0];
}

test("compressed backup and restore preserve Bengali, barcode zeros, source image and edits", async () => {
  const cookie = await owner();
  assert.equal((await save(sample, cookie)).status, 200);
  const response = await GET(request("?key=" + encodeURIComponent(sample.key), cookie, { headers: { "accept-encoding": "gzip" } }));
  assert.equal(response.headers.get("content-encoding"), "gzip");
  const restored = JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString());
  assert.deepEqual(restored.catalog, sample);
  const edited = { ...sample, products: [{ ...sample.products[0], nameBn: "লাক্স সাবান সম্পাদিত" }] };
  assert.equal((await save(edited, cookie)).status, 200);
  const history = await (await GET(request("", cookie))).json();
  assert.equal(history.items.length, 1);
  assert.equal(history.items[0].productCount, 1);
  assert.deepEqual((await (await GET(request("?key=" + encodeURIComponent(sample.key), cookie))).json()).catalog, edited);
});

test("different visitors cannot read or overwrite each other's snapshot for the same store", async () => {
  const a = await owner(), b = await owner();
  assert.notEqual(a, b);
  await save(sample, a);
  const before = await (await GET(request("?key=" + encodeURIComponent(sample.key), b))).json();
  assert.equal(before.catalog, null);
  const separate = { ...sample, products: [{ ...sample.products[0], nameEn: "Another visitor's catalog" }] };
  await save(separate, b);
  assert.equal((await (await GET(request("?key=" + encodeURIComponent(sample.key), a))).json()).catalog.products[0].nameEn, "Lux Soap");
});

test("reject cross-origin writes, malformed backups, and oversized requests", async () => {
  assert.equal((await POST(request("", "", { method: "POST", headers: { origin: "https://other.example" }, body: JSON.stringify(sample) }))).status, 403);
  assert.equal((await POST(request("", "", { method: "POST", body: "not json" }))).status, 400);
  assert.equal((await POST(request("", "", { method: "POST", body: "x".repeat(4_000_001) }))).status, 413);
  assert.equal((await POST(request("", "", { method: "POST", headers: { "content-encoding": "gzip" }, body: "broken gzip" }))).status, 413);
  assert.equal((await GET(request("?offset=-1"))).status, 400);
});

test("missing Neon configuration returns a useful error without leaking a connection string", async () => {
  const value = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const response = await GET(request());
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /saved in this browser/);
  } finally { process.env.DATABASE_URL = value; }
});
