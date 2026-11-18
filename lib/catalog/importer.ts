import type { Batch, Cursor, Product, Task } from "./types";
import { CatalogError, allowed, publicUrl, readPublic, robotRules, sameShop, storeUrl } from "./network";
import { chaldal, isProductPath, parsePage, shopify, sitemapTasks, unwanted, woo } from "./parse";

const feedSize=30;
const maxSeen=45000;
const maxQueue=3200;
function taskKey(t:Task) {
  const s=t.kind+"|"+t.url+"|"+(t.offset||0)+"|"+(t.retry||0);
  let a=2166136261,b=5381;
  for (let i=0;i<s.length;i++) {a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b,33)^s.charCodeAt(i);}
  return (a>>>0).toString(36)+"."+(b>>>0).toString(36);
}
function makeQueue(c:Cursor) {
  const visited=new Set(c.seen), queued=new Set(c.tasks.map(taskKey));
  let limited=false;
  return {
    push(tasks:Task[], first=false) {
      const add:Task[]=[];
      for (const t of tasks) {
        let url:URL; try {url=publicUrl(t.url);} catch {continue;}
        if (!sameShop(url,new URL(c.origin)) || unwanted(url.href) || !allowed(url,c.rules)) continue;
        url.hash=""; for (const k of Array.from(url.searchParams.keys())) if (/^(?:utm_.*|fbclid|gclid)$/i.test(k)) url.searchParams.delete(k);
        t.url=url.href;
        const id=taskKey(t); if (visited.has(id) || queued.has(id)) continue;
        if (c.tasks.length+add.length>=maxQueue || visited.size>=maxSeen) {limited=true;continue;}
        queued.add(id);add.push(t);
      }
      if (first) c.tasks.unshift(...add); else c.tasks.push(...add);
    },
    take(n:number) { const tasks=c.tasks.splice(0,n); for (const t of tasks) {const k=taskKey(t);visited.add(k);queued.delete(k);} return tasks; },
    finish() { c.seen=Array.from(visited);return limited; },
  };
}
function cResponse(products:Product[], cursor:Cursor, hasMore:boolean, skipped=0, limited=false):Batch {
  return {products:[...new Map(products.map(p=>[p.id,p])).values()],cursor:hasMore ? cursor : null,method:cursor.engine,skipped,limited};
}
async function feed(c:Cursor,engine:"Shopify"|"WooCommerce") {
  const url=new URL(engine==="Shopify" ? "/products.json" : "/wp-json/wc/store/v1/products",c.origin);
  url.searchParams.set(engine==="Shopify" ? "limit":"per_page",String(feedSize)); url.searchParams.set("page",String(c.page));
  const r=await readPublic(url,{shop:new URL(c.origin),rules:c.rules});
  let json:any;
  try {json=JSON.parse(r.text());} catch {throw new CatalogError("This store does not expose this catalog feed.");}
  const rows=engine==="Shopify" ? json?.products : json;
  if (!Array.isArray(rows) || (engine==="WooCommerce" && rows.length && !rows[0]?.permalink)) throw new CatalogError("This store does not expose this catalog feed.");
  const products=engine==="Shopify" ? shopify(rows,c.origin) : woo(rows,c.origin);
  const pages=Number(r.headers.get("X-WP-TotalPages"));
  const hasMore=engine==="WooCommerce" && pages>0 ? c.page<pages : rows.length>=feedSize;
  const cursor={...c,engine,page:c.page+1,tasks:[],seen:[]};
  return cResponse(products,cursor,hasMore);
}
function checkCursor(input:Cursor,site:URL) {
  if (!input || !["Shopify","WooCommerce","Store pages","Chaldal"].includes(input.engine) || !sameShop(publicUrl(input.origin),site) ||
      !Number.isInteger(input.page) || input.page<1 || input.page>100000 ||
      !Array.isArray(input.tasks) || input.tasks.length>maxQueue || !Array.isArray(input.seen) || input.seen.length>maxSeen ||
      !Array.isArray(input.rules) || input.rules.length>4500 ||
      input.rules.some(r=>typeof r?.allow!=="boolean" || typeof r.path!=="string" || r.path.length>750) ||
      input.tasks.some(t=>!t || !["page","map","category"].includes(t.kind) || typeof t.url!=="string" || (t.retry!=null && t.retry!==1) || (t.offset!=null && (!Number.isSafeInteger(t.offset) || t.offset<0))) ||
      input.seen.some(s=>typeof s!=="string" || s.length>32)) throw new CatalogError("This import session is invalid. Start a new import.",400);
}
async function scan(c:Cursor, initial:Product[]=[]) {
  const q=makeQueue(c); const picked=q.take(c.engine==="Chaldal" ? 2 : 4);
  let skipped=0, partial=false;
  const results=await Promise.all(picked.map(async(t)=>{
    try {
      const result=await readPublic(publicUrl(t.url),{shop:new URL(c.origin),rules:c.rules});
      const body=result.text(); const effective=result.url.href;
      if (t.kind==="category") {
        const parsed=chaldal(body,effective,t.label||"");
        return {products:parsed.products,tasks:[] as Task[],partial:parsed.incomplete,front:false};
      }
      if (t.kind==="map") {
        if (!/<(?:\w+:)?(?:sitemapindex|urlset)[\s>]/i.test(body)) return null;
        const found=sitemapTasks(body,effective);
        const offset=t.offset||0,chunk=found.slice(offset,offset+160);
        if (found.length>offset+160) chunk.push({...t,offset:offset+160});
        return {products:[] as Product[], tasks:chunk,partial:false,front:true};
      }
      const page=parsePage(body,effective);
      // Product detail pages often repeat the whole navigation. The listing pages
      // already supply those links, so expanding every detail would delay imports.
      return {products:page.products,tasks:page.products.length && isProductPath(result.url.pathname) ? [] : page.tasks,partial:false,front:false};
    } catch (error) {
      if (error instanceof CatalogError && error.status===429) throw error;
      if (error instanceof CatalogError && !t.retry && [502,503,504].includes(error.status)) {
        return {products:[] as Product[],tasks:[{...t,retry:1} as Task],partial:false,front:false};
      }
      return {products:[] as Product[],tasks:[] as Task[],partial:false,front:false,skipped:true};
    }
  }));
  const products=[...initial];
  for (const r of results) {
    if (!r) continue;
    if (r.skipped) skipped++;
    products.push(...r.products); q.push(r.tasks,r.front); partial ||= r.partial;
  }
  const limited=q.finish() || partial;
  return cResponse(products,c,c.tasks.length>0,skipped,limited);
}
export async function importStore(value:unknown,resume?:Cursor):Promise<Batch> {
  const site=storeUrl(value);
  if (resume) {
    checkCursor(resume,site);
    if (resume.engine==="Shopify" || resume.engine==="WooCommerce") return feed(resume,resume.engine);
    return scan(resume);
  }
  let robots={rules:[] as Cursor["rules"],maps:[] as string[]};
  try {
    const raw=await readPublic(new URL("/robots.txt",site),{shop:site,limit:700000,timeout:8500});
    if (!/^\s*</.test(raw.text())) robots=robotRules(raw.text());
  } catch (error) { if (error instanceof CatalogError && error.status===429) throw error; }
  const cursor:Cursor={engine:"Store pages",origin:site.origin,page:1,rules:robots.rules,tasks:[],seen:[]};
  if (!allowed(site,cursor.rules)) throw new CatalogError("This store asks automated importers to skip its website.",403);
  // Chaldal includes both its featured products and its category directory on
  // this public listing. Return that first batch without waiting for more pages.
  const isChaldal=site.hostname.replace(/^www\./i,"").toLowerCase()==="chaldal.com";
  let home:Awaited<ReturnType<typeof readPublic>>|undefined;
  if (isChaldal) {
    const featured=new URL("/popular",site);
    if (allowed(featured,cursor.rules)) {
      try {home=await readPublic(featured,{shop:site,rules:cursor.rules,timeout:32000});}
      catch (error) {if(error instanceof CatalogError && [401,403,429].includes(error.status)) throw error;}
    }
  }
  home ||= await readPublic(site,{shop:site,rules:cursor.rules,timeout:isChaldal ? 32000 : 24000});
  cursor.origin=home.url.origin;
  const html=home.text();
  if (isChaldal && html.includes("window.__serviceState")) {
    const isFeatured=home.url.pathname.replace(/\/$/,"")==="/popular";
    const root=chaldal(html,home.url.href,isFeatured ? "Popular" : "");
    if (root.categories.length) {
      cursor.engine="Chaldal";
      if(isFeatured && root.products.length) cursor.seen.push(taskKey({kind:"category",url:home.url.href}));
      const queue=makeQueue(cursor);
      queue.push(root.categories);
      const limited=queue.finish() || root.incomplete;
      if(root.products.length) return cResponse(root.products,cursor,!!cursor.tasks.length,0,limited);
      return scan(cursor);
    }
  }
  const wp=/wp-content|woocommerce|api\.w\.org/i.test(html),shop=/cdn\.shopify\.com|Shopify\.shop|myshopify\.com|\/cdn\/shop\//i.test(html);
  const probes:("Shopify"|"WooCommerce")[]=wp && !shop ? ["WooCommerce","Shopify"] : ["Shopify","WooCommerce"];
  for (const source of probes) {
    try {const batch=await feed(cursor,source);if (batch.products.length) return batch;}
    catch(error) {if(error instanceof CatalogError && error.status===429) throw error;}
  }
  const root=parsePage(html,home.url.href);
  cursor.seen.push(taskKey({kind:"page",url:home.url.href}));
  const q=makeQueue(cursor);
  const maps=robots.maps.length ? robots.maps : [new URL("/sitemap.xml",home.url).href];
  q.push(root.tasks.filter(t=>isProductPath(new URL(t.url).pathname)).slice(0,4));
  q.push(maps.map(url=>({url,kind:"map"})));
  q.push(root.tasks);
  q.finish();
  if (!root.products.length && !cursor.tasks.length) throw new CatalogError("No public products were found at this website. Check the store address or try another store.");
  if (root.products.length) return cResponse(root.products,cursor,!!cursor.tasks.length);
  return scan(cursor);
}
