export const runtime = "nodejs";
export const maxDuration = 30;

import { CatalogError, publicUrl, readPublic } from "@/lib/catalog/network";
function imageType(bytes:Uint8Array) {
  const header=String.fromCharCode(...bytes.slice(0,40));
  if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return "image/jpeg";
  if (bytes[0]===137 && header.slice(1,4)==="PNG") return "image/png";
  if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) return "image/gif";
  if (header.startsWith("RIFF") && header.slice(8,12)==="WEBP") return "image/webp";
  if (header.slice(4,8)==="ftyp" && /avif|avis/.test(header.slice(8))) return "image/avif";
  return "";
}
export async function GET(request:Request) {
  try {
    const url=publicUrl(new URL(request.url).searchParams.get("url"));
    const r=await readPublic(url,{image:true,limit:4_000_000});
    const type=imageType(r.bytes);
    if (!type) throw new CatalogError("The source did not return a supported product photo.",415);
    return new Response(r.bytes.buffer,{headers:{"Content-Type":type,"Cache-Control":"public,max-age=86400","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'"}});
  } catch (e) {return Response.json({error:e instanceof Error ? e.message : "Image unavailable"},{status:e instanceof CatalogError ? e.status : 502});}
}
