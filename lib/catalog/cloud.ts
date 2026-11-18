import type { Catalog } from "./types";

export type CloudCatalog = { key: string; site: string; date: string; productCount: number; updatedAt: string };

async function cloudResponse(response: Response) {
  let data;
  try { data = await response.json(); }
  catch { throw new Error("Cloud backups are temporarily unavailable. Your browser copy is still available."); }
  if (!response.ok) throw new Error(data.error || "Cloud backups could not be reached.");
  return data;
}

export async function listCloudCatalogs(offset = 0): Promise<{ items: CloudCatalog[]; nextOffset: number | null }> {
  return cloudResponse(await fetch("/api/catalogs?offset=" + offset, { cache: "no-store" }));
}

export async function loadCloudCatalog(key: string): Promise<Catalog> {
  const data = await cloudResponse(await fetch("/api/catalogs?key=" + encodeURIComponent(key), { cache: "no-store" }));
  if (!data.catalog) throw new Error("This cloud backup could not be found.");
  return data.catalog;
}

export async function saveCloudCatalog(catalog: Catalog) {
  let body = new Blob([JSON.stringify(catalog)], { type: "application/json" });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof CompressionStream !== "undefined") {
    body = await new Response(body.stream().pipeThrough(new CompressionStream("gzip"))).blob();
    headers["Content-Encoding"] = "gzip";
  }
  if (body.size > 4_000_000) throw new Error("This catalog exceeds the 4 MB cloud backup limit. Your browser copy and exports are still available.");
  return cloudResponse(await fetch("/api/catalogs", { method: "POST", headers, body }));
}
