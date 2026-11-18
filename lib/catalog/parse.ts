import { plain } from "./text";
import { parseHTML } from "linkedom/worker";
import { publicUrl, sameShop } from "./network";
import type { Product, Task } from "./types";

type Row = Record<string, any>;
const bengali = /[\u0980-\u09ff]/;
export function href(value: unknown, base: string): string {
  const candidate=Array.isArray(value) ? value[0] : value;
  const raw=typeof candidate==="object" && candidate ? candidate.contentUrl || candidate.url || candidate.src || candidate["@id"] : candidate;
  if (!raw || typeof raw !== "string") return "";
  try { return publicUrl(raw.replace(/&amp;/g,"&"),base).href; } catch { return ""; }
}
function names(name: unknown, bn?: unknown, en?: unknown, lang = "") {
  const data = {nameEn:plain(en), nameBn:plain(bn), originalName:"", language:""};
  for (const item of Array.isArray(name) ? name : [name]) {
    let val = plain(item), language=lang;
    if (item && typeof item === "object") {
      val=plain(item["@value"] || item.value); language=plain(item["@language"] || lang);
      data.nameBn ||= plain(item.bn); data.nameEn ||= plain(item.en);
    }
    if (!val) continue;
    if (bengali.test(val) || language.startsWith("bn")) data.nameBn ||= val;
    else if (language && !/^en(?:-|$)/i.test(language)) { data.originalName=val; data.language=language.split("-")[0].toLowerCase(); }
    else data.nameEn ||= val;
  }
  return data;
}
export function findSize(...pieces: unknown[]) {
  for (const p of pieces) {
    const text=plain(p);
    const found=text.match(/(?:[0-9০-৯]+(?:[.,][0-9০-৯]+)?\s*[x×]\s*)?[0-9০-৯]+(?:[.,][0-9০-৯]+)?\s*(?:fl\.?\s*oz|kilograms?|kilogrammes?|millilit(?:er|re)s?|lit(?:er|re)s?|grams?|grammes?|gms?|kgs?|mg|mls?|ltrs?|lbs?|oz|pieces?|pcs?|packs?|capsules?|tablets?|sheets?|pairs?|cm|mm|inch(?:es)?|g|l|কেজি|কিলোগ্রাম|মিলিলিটার|লিটার|গ্রাম|মিলি|পিস|টি)(?![a-zA-Z\u0980-\u09FF])/i);
    if (found) return found[0].trim();
  } return "";
}
const sizes:Record<string,string>={KGM:"kg",GRM:"g",LTR:"L",MLT:"ml",ONZ:"oz",LBR:"lb",CMT:"cm",MMT:"mm",H87:"pcs",INH:"in"};
function quantity(value: unknown): string {
  if (Array.isArray(value)) return quantity(value[0]);
  if (typeof value==="object" && value) { const v=value as Row;const n=plain(v.value),unit=plain(v.unitText) || sizes[plain(v.unitCode)] || plain(v.unitCode); return [n,unit].filter(Boolean).join(" "); }
  return plain(value);
}
function code(row:Row,id?:unknown) {
  for (const field of ["gtin","gtin14","gtin13","gtin12","gtin8","barcode","ean","upc","global_unique_id"]) {
    const value=plain(row[field]); if (value) return {code:value,codeType:"Barcode"};
  }
  if (plain(row.sku)) return {code:plain(row.sku),codeType:"SKU"};
  if (plain(row.mpn)) return {code:plain(row.mpn),codeType:"MPN"};
  const value=plain(row.productID??id); return {code:value,codeType:value ? "Product ID" : "Code"};
}
export function shopify(rows:Row[], site:string) {
  return rows.flatMap(row => {
    if (!row.title || !row.handle) return [];
    const variants:Row[]=row.variants?.length ? row.variants : [{}];
    return variants.map(v=>{
      const option=plain(v.title) === "Default Title" ? "" : plain(v.title);
      const title=plain(row.title) + (variants.length>1 && option ? " · " + option : "");
      const url=new URL("/products/" + encodeURIComponent(row.handle),site);
      if (variants.length>1 && v.id) url.searchParams.set("variant",String(v.id));
      const sizeOption=(row.options || []).find((o:Row)=>/size|weight|volume|quantity|pack|পরিমাণ/i.test(o.name));
      const variantSize=sizeOption ? v["option" + Number(sizeOption.position)] : "";
      const image=(row.images || []).find((im:Row)=>im.id===v.image_id || im.variant_ids?.includes(v.id)) || row.images?.[0] || row.image;
      const weight=Number(v.weight)>0 && v.weight_unit ? String(v.weight)+" "+v.weight_unit : "";
      return {id:"shop-" + String(v.id || row.id || row.handle), ...names(title),...code(v,variants.length>1 ? v.id : row.id),
        category:plain(row.product_type), size:plain(variantSize) || findSize(option,row.title) || weight, imageUrl:href(image,site),sourceUrl:url.href};
    });
  });
}
export function woo(rows:Row[], site:string) {
  return rows.filter(r=>r?.name && r.permalink).map(r=>{
    const a=(r.attributes||[]).find((v:Row)=>/size|weight|weight.volume|capacity|volume|quantity|pack|ওজন|পরিমাণ/i.test(v.name));
    return {id:"woo-"+String(r.id),...names(r.name),...code(r,r.id),category:plain(r.categories?.[0]?.name),
      size:(a?.terms || []).map((t:Row)=>plain(t.name)).filter(Boolean).join(" / ") || findSize(r.name,r.short_description),
      sourceUrl:href(r.permalink,site),imageUrl:href(r.images?.[0]?.src,site)};
  });
}
function embedded(html:string, key:string):Row {
  const marker=new RegExp("window\\."+key+"\\s*=\\s*").exec(html);
  if (!marker) return {};
  const start=marker.index+marker[0].length;
  const end=html.indexOf("</script",start);
  try { return JSON.parse(html.slice(start,end<0 ? undefined : end).trim().replace(/;\s*$/,"")); } catch { return {}; }
}
export function chaldal(html:string,site:string,category:string) {
  const service=embedded(html,"__serviceState");
  const container=Object.values(embedded(html,"__reactAsyncStatePacket")).find((v:any)=>v?.products?.items) as Row | undefined;
  const data=container?.products || {};
  const all:Row[]=[...(data.items || []),...(data.cache?.items || [])];
  const products=all.filter(x=>x.Slug && x.NameWithoutSubText).map(x=>({
    id:"chaldal-"+String(x.ProductVariantId),...names(x.NameWithoutSubText,x.NameBnWithoutSubText || x.NameBn),...code({barcode:x.Barcode || x.Barcodes?.[0]},x.ProductVariantId),
    category,size:plain(x.SubText),imageUrl:href(x.PictureUrls?.[0],site),sourceUrl:href("/"+x.Slug,site)
  }));
  const services=service.CategoryService?.categories?.["1"] || [];
  const routes=service.RouterService?.categoryRoutes?.["1"] || {};
  const categories:Task[]=services.filter((c:Row)=>c.ContainsProducts && routes[c.Id]).map((c:Row)=>({kind:"category",url:href("/"+routes[c.Id],site),label:plain(c.Name)}));
  const incomplete=!!data.hasMore && Number(data.count)>new Set(products.map(p=>p.id)).size;
  return {products,categories,incomplete};
}

function jsonItems(raw: unknown, visit:(v:Row)=>void) {
  if (!raw || typeof raw!=="object") return;
  if (Array.isArray(raw)) { for (const x of raw) jsonItems(x,visit); return; }
  const row=raw as Row; visit(row);
  for (const key of ["@graph","itemListElement","item","mainEntity","hasVariant","subjectOf"]) if (row[key]) jsonItems(row[key],visit);
}
export function parsePage(html:string,site:string) {
  const {document}=parseHTML(html);
  const meta=(q:string) => document.querySelector(q)?.getAttribute("content") || "";
  const canonical=href(document.querySelector('link[rel="canonical"]')?.getAttribute("href"),site)||site;
  const lang=plain(document.documentElement?.getAttribute("lang"));
  const tasks:Task[]=[], products:Product[]=[];
  const siteUrl=new URL(site);
  function add(value:unknown, kind:Task["kind"]="page",label?:string) {
    const u=href(value,site); if (u && sameShop(new URL(u),siteUrl) && !unwanted(u)) tasks.push({kind,url:u,label});
  }
  for (const el of document.querySelectorAll('script[type*="ld+json" i]')) {
    let data:unknown; try { data=JSON.parse(el.textContent || ""); } catch { continue; }
    jsonItems(data,(r:Row)=>{
      const types=(Array.isArray(r["@type"]) ? r["@type"] : [r["@type"]]).map(t=>String(t).split(/[/#]/).pop()?.toLowerCase());
      if (types.includes("listitem")) { add(typeof r.item==="object" ? r.item.url||r.item["@id"] : r.item || r.url); }
      if (!types.includes("product") && !types.includes("productmodel") && !types.includes("individualproduct")) return;
      const titles=names(r.name, r.name_bn||r.nameBn,r.name_en||r.nameEn,lang);
      if (!titles.nameBn && !titles.nameEn && !titles.originalName) { add(r.url||r["@id"]); return; }
      const offer=Array.isArray(r.offers) ? r.offers[0] || {} : r.offers || {};
      const url=href(r.url || offer.url || r["@id"],canonical) || canonical;
      const codes=code({...offer,...r});
      const attrs=(Array.isArray(r.additionalProperty)?r.additionalProperty:[r.additionalProperty]).filter(Boolean);
      const attr=attrs.find((p:Row)=>/size|weight|volume|quantity|capacity|পরিমাণ|ওজন/i.test(String(p.name)));
      products.push({id:"web-"+url+"|"+(codes.code || titles.nameEn || titles.nameBn || titles.originalName),...titles,...codes,
        category:plain(r.category?.name || r.category),size:quantity(r.size)||quantity(r.weight)||quantity(attr)||findSize(r.name),
        sourceUrl:url,imageUrl:href(r.image,site)||href(meta('meta[property="og:image"]'),site)});
    });
  }
  if (!products.length && (document.querySelector('[itemtype*="schema.org/Product"],[property^="product:price"],[itemprop="price"],.product_main,.single-product .product_title') || /product/i.test(meta('meta[property="og:type"]')))) {
    const prop=(name:string) => {const el=document.querySelector('[itemprop="'+name+'"]');return el?.getAttribute("content") || el?.getAttribute("src") || el?.textContent || "";};
    const mapping:Row={};
    for (const tr of document.querySelectorAll("tr")) {
      const header=plain(tr.querySelector("th")?.textContent).toLowerCase(), val=plain(tr.querySelector("td")?.textContent);
      if (/^(upc|ean|barcode|gtin|sku|mpn)$/.test(header)) mapping[header]=val;
      if (/^(weight|size|volume|net weight)$/.test(header)) mapping.size=val;
    }
    for (const field of ["gtin","gtin13","gtin12","gtin8","gtin14","sku","mpn","productID"]) mapping[field] ||= prop(field);
    mapping.sku ||= meta('meta[property="product:retailer_item_id"]') || plain(document.querySelector(".sku")?.textContent);
    const title=plain(document.querySelector("h1")?.textContent) || prop("name") || meta('meta[property="og:title"]');
    const img=meta('meta[property="og:image:secure_url"]')||meta('meta[property="og:image"]')||prop("image")||document.querySelector('#product_gallery img,.woocommerce-product-gallery img,.product-image img')?.getAttribute("src");
    if (title) products.push({id:"web-"+canonical+"|"+(code(mapping).code || title),...names(title,undefined,undefined,lang),...code(mapping),
      category:plain(prop("category")),size:plain(mapping.size)||plain(prop("size"))||findSize(title,prop("weight")),sourceUrl:canonical,imageUrl:href(img,site)});
  }
  for (const a of document.querySelectorAll("a[href],link[rel=next],link[rel=sitemap]")) {
    const val=a.getAttribute("href") || "";
    if (val.startsWith("#") || /^(?:mailto|tel|javascript):/i.test(val)) continue;
    const u=href(val,site);
    if (!u || !sameShop(new URL(u),siteUrl) || unwanted(u)) continue;
    const path=new URL(u).pathname;
    const rel=a.getAttribute("rel")||"";
    if (rel.includes("sitemap")) { add(u,"map"); continue; }
    const card=a.closest('article.product_pod,li.product,[itemtype*="schema.org/Product"],.product-card,.product-item,.product-tile,[data-product-id]');
    if (isProductPath(path) || card || /(?:product|woocommerce-loop-product)[-_](?:link|name|title)/i.test(a.className)) { add(u); continue; }
    if (rel.includes("next") || a.closest(".pagination,.pager,.next") || /\/(?:collections?|catalog(?:ue)?|shop|store|categor(?:ies|y)|products)(?:\/|$)/i.test(path) || /^\/(?:en\/|bn\/)?(?:shop|products|all-products|brands|collections)\/?$/i.test(path)) add(u);
  }
  return {products,tasks};
}
export function unwanted(url:string) {
  return /(?:\/(?:account|login|signin|cart|checkout|logout|register|search|wp-admin|wishlist|blogs?|news|policies|pages\/(?:contact|about|terms)|assets|cdn-cgi)(?:\/|[?#]|$)|\.(?:jpg|jpeg|webp|avif|png|svg|pdf|zip|gif|css|js|woff2?)(?:\?|$)|[?&](?:add-to-cart|sort_by|filter[^=]*|replytocom)=)/i.test(url);
}
export function isProductPath(path:string) { return /\/(?:products?|p|item|items|dp|ip)\/[^/]+|\/catalogue\/(?!category)[^/]+\/index\.html|\/[^/]+-i\d+(?:-s\d+)?\.html/i.test(path); }
export function sitemapTasks(xml:string,site:string) {
  const index=/<(?:\w+:)?sitemapindex[\s>]/i.test(xml);
  const rows=xml.match(/<(?:\w+:)?(?:url|sitemap)\b[^>]*>[\s\S]*?<\/(?:\w+:)?(?:url|sitemap)>/gi) || [];
  const links=rows.map(row=>href(row.match(/<(?:\w+:)?loc\b[^>]*>([\s\S]*?)<\/(?:\w+:)?loc>/i)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g,"").trim(),site))
    .filter(u=>u && sameShop(new URL(u),new URL(site)) && !unwanted(u));
  if (index) links.sort((a,b)=>Number(/product|catalog/i.test(b))-Number(/product|catalog/i.test(a)));
  return links.map(url=>({kind:index ? "map" : "page",url} as Task));
}
