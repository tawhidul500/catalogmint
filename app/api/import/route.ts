export const runtime = "nodejs";
export const maxDuration = 180;

import { importStore } from "@/lib/catalog/importer";
import { CatalogError } from "@/lib/catalog/network";
export async function POST(request:Request) {
  try {
    const raw=await request.text();
    if (raw.length>3_000_000) throw new CatalogError("This import is too large to resume in one request.",413);
    let body;
    try { body=JSON.parse(raw); } catch {throw new CatalogError("Send a store website address.",400);}
    const batch=await importStore(body?.website,body?.cursor || undefined);
    return Response.json(batch,{headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    const e=error instanceof CatalogError ? error : new CatalogError("The store could not be read. Please try again.",502);
    return Response.json({error:e.message},{status:e.status>=400 && e.status<=599 ? e.status : 422,headers:{"Cache-Control":"no-store"}});
  }
}
