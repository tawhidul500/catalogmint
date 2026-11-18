"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Barcode, Box, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Clock3, FolderOpen, Globe2, Grid2X2, History, Images, Info, Languages, LayoutGrid, List, LoaderCircle, Package, Pause, Play, Search, SlidersHorizontal, Store, X } from "lucide-react";
import sampleProducts from "@/public/example/products.json";
import { BrandMark, EditPanel, ExportPanel, Modal, ProductCard, ProductPhoto, translated } from "@/components/catalog/Parts";
import { savedCatalogs, saveCatalog } from "@/lib/catalog/storage";
import { CloudBackups } from "@/components/catalog/CloudBackups";
import { siteHost } from "@/lib/catalog/types";
import type { Batch, Catalog, Locale, Product } from "@/lib/catalog/types";

const demo:Catalog={key:"sample:chaldal",site:"https://chaldal.com/",products:sampleProducts,date:"",cursor:null,method:"Chaldal",skipped:0,limited:false,demo:true};
const pageSize=12;
function cleanSite(value:string) {
  const text=value.trim(); const u=new URL(/^[a-z][a-z0-9+.-]*:/i.test(text)?text:"https://"+text);
  if(!/^https?:$/.test(u.protocol)||u.username||u.password||u.port||!u.hostname.includes(".")||/^[\d.]+$/.test(u.hostname)||u.hostname.includes(":")) throw new Error();
  u.hash="";return u.href;
}
export default function Home(){
  const [catalog,setCatalog]=useState<Catalog>(demo),latest=useRef<Catalog>(demo);
  const [history,setHistory]=useState<Catalog[]>([]),[tab,setTab]=useState<"work"|"history">("work");
  const [locale,setLocale]=useState<Locale>("en"),[view,setView]=useState<"grid"|"list">("grid");
  const [website,setWebsite]=useState(""),[search,setSearch]=useState(""),[category,setCategory]=useState("");
  const [selected,setSelected]=useState<Set<string>>(new Set()),[page,setPage]=useState(1);
  const [busy,setBusy]=useState(false),[err,setErr]=useState(""),[toast,setToast]=useState("");
  const [panel,setPanel]=useState<"help"|"export"|"translate"|null>(null),[edit,setEdit]=useState<Product|null>(null);
  const [hydrated,setHydrated]=useState(false);
  const job=useRef<AbortController|null>(null),touched=useRef(false),toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const t=(en:string,bn:string)=>locale==="en"?en:bn;
  function announce(msg:string){setToast(msg);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(""),6500);}
  function assign(c:Catalog){latest.current=c;setCatalog(c);}
  useEffect(()=>{
    let active=true;
    try{const l=localStorage.getItem("cm-language"),v=localStorage.getItem("cm-view");if(l==="bn")setLocale("bn");if(v==="list")setView("list");}catch{}
    savedCatalogs().then(items=>{if(!active)return;setHistory(items.filter(c=>!c.demo).sort((a,b)=>b.date.localeCompare(a.date)));
      if(touched.current)return;
      let key="";try{key=localStorage.getItem("cm-current")||"";}catch{}
      const last=items.find(c=>c.key===key);if(last)assign(last);
    }).catch(()=>{}).finally(()=>{if(active)setHydrated(true);});
    return ()=>{active=false;};
  },[]);
  useEffect(()=>{document.documentElement.lang=locale;try{localStorage.setItem("cm-language",locale);}catch{}},[locale]);
  useEffect(()=>{try{localStorage.setItem("cm-view",view);}catch{}},[view]);
  useEffect(()=>{
    if(!hydrated)return;
    try{localStorage.setItem("cm-current",catalog.key);}catch{}
    if(!catalog.demo)setHistory(old=>[catalog,...old.filter(c=>c.key!==catalog.key)].sort((a,b)=>b.date.localeCompare(a.date)));
    const timer=setTimeout(()=>{saveCatalog(catalog).catch(()=>announce(t("This browser could not save your history. You can still export this catalog.","এই ব্রাউজারে ইতিহাস সংরক্ষণ হয়নি। ক্যাটালগটি এক্সপোর্ট করতে পারবেন।")));},140);
    return ()=>clearTimeout(timer);
  },[catalog,hydrated]);
  useEffect(()=>()=>{job.current?.abort();if(toastTimer.current)clearTimeout(toastTimer.current);},[]);
  const cats=useMemo(()=>Array.from(new Set(catalog.products.map(p=>p.category).filter(Boolean))).sort((a,b)=>a.localeCompare(b)),[catalog.products]);
  const filtered=useMemo(()=>{const q=search.trim().toLocaleLowerCase();return catalog.products.filter(p=>(!category||p.category===category)&&(!q||[p.nameEn,p.nameBn,p.originalName,p.code,p.size,p.category].some(v=>(v||"").toLocaleLowerCase().includes(q))));},[catalog.products,category,search]);
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize)),activePage=Math.min(page,pages),shown=filtered.slice((activePage-1)*pageSize,activePage*pageSize);
  const checked=filtered.length>0&&filtered.every(p=>selected.has(p.id)),someSelected=filtered.some(p=>selected.has(p.id));
  const missingNames=catalog.products.filter(p=>(!p.nameEn||!p.nameBn)&&(p.nameEn||p.nameBn||p.originalName)).length;
  function resetList(){setSelected(new Set());setSearch("");setCategory("");setPage(1);}
  function toggle(id:string){setSelected(old=>{const s=new Set(old);if(s.has(id))s.delete(id);else s.add(id);return s;});}
  function toggleFiltered(){setSelected(old=>{const s=new Set(old);for(const p of filtered)if(checked)s.delete(p.id);else s.add(p.id);return s;});}
  function open(c:Catalog){if(job.current)job.current.abort();job.current=null;setBusy(false);touched.current=true;assign(c);resetList();setErr("");setTab("work");setWebsite(c.demo?"":c.site);}
  async function fetchStore(resume=false){
    let site:string;
    try{site=resume?catalog.site:cleanSite(website);}catch{setErr(t("Enter the store’s website address, for example https://chaldal.com.","দোকানের ওয়েবসাইটের ঠিকানা লিখুন, যেমন https://chaldal.com।"));return;}
    touched.current=true;job.current?.abort();const controller=new AbortController();job.current=controller;
    const original=latest.current;
    let next:Catalog=resume?{...latest.current}:{key:site,site,date:new Date().toISOString(),products:[],cursor:null,method:"",skipped:0,limited:false};
    let first=true;setWebsite(site);setErr("");setBusy(true);setTab("work");if(!resume)resetList();
    try{
      do{
        const res=await fetch("/api/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({website:site,cursor:next.cursor}),signal:controller.signal});
        const data=await res.json() as Batch & {error?:string};if(!res.ok||data.error)throw Error(data.error||t("The store could not be read.","ওয়েবসাইটটি পড়া যায়নি।"));
        if(controller.signal.aborted||job.current!==controller)return;
        const current=first&&!resume?next:(latest.current.key===next.key?latest.current:next);
        const products=new Map(current.products.map(p=>[p.id,p]));
        for(const p of data.products)if(!products.has(p.id))products.set(p.id,p);
        next={...next,products:[...products.values()],cursor:data.cursor,method:data.method,skipped:next.skipped+data.skipped,limited:next.limited||data.limited};
        if(next.products.length || next.cursor)assign(next);
        first=false;
        if(next.cursor)await new Promise(r=>setTimeout(r,250));
      }while(next.cursor&&!controller.signal.aborted);
      if(!next.products.length){assign(original);setErr(t("No public products were found. The store may require sign-in or load its catalog privately.","প্রকাশ্য পণ্য পাওয়া যায়নি। দোকানটি লগইন চাইতে পারে বা পণ্যের তালিকা ব্যক্তিগত রাখতে পারে।"));}
      else{assign(next);announce(t("Import finished. "+next.products.length+" products are ready to review.","আমদানি শেষ। "+next.products.length+"টি পণ্য দেখতে পারবেন।"));}
    }catch(e){if(!controller.signal.aborted){setErr(e instanceof Error?e.message:t("Import failed. Try again.","আবার চেষ্টা করুন।"));if(!next.products.length&&!next.cursor)assign(original);}}
    finally{if(job.current===controller){setBusy(false);job.current=null;}}
  }
  function pause(){job.current?.abort();job.current=null;setBusy(false);announce(t("Import paused. Products already loaded are available.","আমদানি থামানো হয়েছে। পাওয়া পণ্যগুলো দেখতে পারবেন।"));}
  function updateProduct(p:Product){const current=latest.current;assign({...current,products:current.products.map(old=>old.id===p.id?p:old)});setEdit(null);announce(t("Product details saved.","পণ্যের তথ্য সংরক্ষিত হয়েছে।"));}
  const fmt=(n:number)=>n.toLocaleString(locale);
  return <div className="app-shell"><a className="skip" href="#main">{t("Skip to content","মূল অংশে যান")}</a>
    <header className="site-header"><div className="frame header-wrap">
      <a className="wordmark" href="#workspace" aria-label="CatalogMint workspace" onClick={e=>{e.preventDefault();setTab("work");}}><BrandMark/><span>Catalog<span className="mint-word">Mint</span></span></a>
      <nav aria-label={t("Main navigation","প্রধান মেনু")}><button className={tab==="work"?"nav-item active":"nav-item"} onClick={()=>setTab("work")}><LayoutGrid size={16}/><span>{t("Workspace","ওয়ার্কস্পেস")}</span></button><button className={tab==="history"?"nav-item active":"nav-item"} onClick={()=>setTab("history")}><History size={17}/><span>{t("Import history","আমদানির ইতিহাস")}</span></button></nav>
      <div className="header-right"><button className="language" onClick={()=>setLocale(locale==="en"?"bn":"en")} aria-label={locale==="en"?"বাংলায় দেখুন":"Switch to English"}><Languages size={17}/><span>{locale==="en"?"বাংলা":"English"}</span></button><span className="header-line"/><button className="help-button" onClick={()=>setPanel("help")} aria-label={t("Help","সহায়তা")} title={t("Help","সহায়তা")}><CircleHelp size={20}/></button></div>
    </div></header>
    <main id="main" className="frame main-frame">{tab==="work"?<>
      <section className="import-hero" aria-labelledby="hero-title">
        <div className="hero-art" aria-hidden="true"><div className="blueprint"/><div className="scan-corners"><i/><i/><i/><i/></div><div className="parcel-shadow"/><img src="/visuals/parcels.webp" alt="" fetchPriority="high"/></div>
        <div className="hero-content"><h1 id="hero-title">{t("Store catalog importer","দোকানের ক্যাটালগ আমদানি")}</h1><p>{t("Enter a store’s website to collect product details and original images.","দোকানের পণ্যের তথ্য ও মূল ছবি পেতে ওয়েবসাইটের ঠিকানা দিন।")}</p>
          <form onSubmit={e=>{e.preventDefault();if(!busy)void fetchStore();}} className="url-form"><div className="url-input"><Globe2 size={19}/><label htmlFor="store-website" className="sr-only">{t("Store website URL","দোকানের ওয়েবসাইটের ঠিকানা")}</label><input id="store-website" placeholder={t("https://your-store.com","https://your-store.com")} type="text" inputMode="url" autoComplete="url" spellCheck={false} autoCapitalize="off" value={website} disabled={busy} onChange={e=>{setWebsite(e.target.value);if(err)setErr("");}} aria-invalid={!!err}/></div>
          {busy?<button type="button" className="fetch" onClick={pause}><Pause size={16}/>{t("Pause import","আমদানি থামান")}</button>:<button type="submit" className="fetch">{t("Fetch products","পণ্য আনুন")}<ArrowRight size={17}/></button>}</form>
        </div>
      </section>
      {err&&<div className="notice warn" role="alert"><Info size={18}/><span>{err}</span><button className="bare" onClick={()=>setErr("")} aria-label={t("Dismiss","বন্ধ করুন")}><X size={16}/></button></div>}
      {(busy || catalog.cursor && !catalog.demo)&&<div className="notice live" role="status">{busy?<LoaderCircle size={17} className="spin"/>:<Pause size={16}/>}<span>{busy?t("Reading "+siteHost(website)+"…","পড়া হচ্ছে "+siteHost(website)+"…"):t("Import paused. More products may be available.","আমদানি থেমে আছে। আরও পণ্য পাওয়া যেতে পারে।")}</span>{!busy&&<button className="text-button" onClick={()=>void fetchStore(true)}><Play size={13}/>{t("Resume import","আবার শুরু করুন")}</button>}</div>}
      <section className="catalog-section" aria-labelledby="catalog-title">
        <div className="catalog-head"><div><div className="title-line"><h2 id="catalog-title">{t("Product catalog","পণ্যের ক্যাটালগ")}</h2><span className="count-pill">{fmt(catalog.products.length)}</span></div>
        <div className="source-line"><Store size={15}/><span>{siteHost(catalog.site)}</span><span className="small-dot"/>{catalog.demo?<span className="sample-text">{t("Sample catalog","নমুনা ক্যাটালগ")}</span>:<span>{catalog.method||t("Store website","দোকানের ওয়েবসাইট")}</span>}</div></div>
        <div className="catalog-actions"><div className="view-toggle"><button aria-label={t("Grid view","গ্রিড ভিউ")} aria-pressed={view==="grid"} title={t("Grid view","গ্রিড ভিউ")} onClick={()=>setView("grid")}><Grid2X2 size={17}/></button><button aria-label={t("List view","তালিকা ভিউ")} title={t("List view","তালিকা ভিউ")} aria-pressed={view==="list"} onClick={()=>setView("list")}><List size={18}/></button></div>
        <button className="primary export-button" disabled={!catalog.products.length} onClick={()=>setPanel("export")}><ArrowDownToLine size={17}/>{selected.size?t("Export selected","বাছাই এক্সপোর্ট"):t("Export catalog","এক্সপোর্ট করুন")}<ChevronDown size={15}/></button></div></div>
        {(!busy && !catalog.demo && (catalog.skipped>0||catalog.limited))&&<div className="notice small"><Info size={16}/><span>{t("Partial catalog. ","আংশিক ক্যাটালগ। ")}{catalog.skipped>0?t(fmt(catalog.skipped)+" pages could not be read. ",fmt(catalog.skipped)+"টি পৃষ্ঠা পড়া যায়নি। "):""}{catalog.limited?t("The store exposed only part of a listing or a discovery limit was reached.","তালিকার অংশবিশেষ পাওয়া গেছে বা অনুসন্ধানের সীমা পূর্ণ হয়েছে।"):""}</span></div>}
        <div className="toolbar"><label className="search-box"><Search size={17}/><input aria-label={t("Search products","পণ্য খুঁজুন")} placeholder={t("Search products…","পণ্য খুঁজুন…")} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/>{search&&<button className="bare" aria-label={t("Clear search","অনুসন্ধান মুছুন")} onClick={()=>{setSearch("");setPage(1);}}><X size={13}/></button>}</label>
        <div className="category-select"><SlidersHorizontal size={15}/><select aria-label={t("Filter by category","বিভাগ অনুযায়ী দেখুন")} value={category} onChange={e=>{setCategory(e.target.value);setPage(1);}}><option value="">{t("All categories","সব বিভাগ")}</option>{cats.map(c=><option key={c}>{c}</option>)}</select><ChevronDown size={14}/></div>
        <div className="toolbar-right">{missingNames>0&&<button className="translate-control" onClick={()=>setPanel("translate")} title={t("Fill missing names","অনুপস্থিত নাম অনুবাদ করুন")}><Languages size={15}/><span>{t("Translate names","নাম অনুবাদ")}</span></button>}<label className="select-all"><input type="checkbox" aria-label={t("Select all filtered products","ফিল্টারের সব পণ্য বাছাই")} checked={checked} disabled={!filtered.length} ref={e=>{if(e)e.indeterminate=!checked&&someSelected;}} onChange={toggleFiltered}/>{t("Select all","সব বাছাই")}</label></div></div>
        {selected.size>0&&<div className="selection-strip"><CheckCheck size={16}/>{fmt(selected.size)} {t("selected","টি বাছাই করা হয়েছে")}<button className="text-button" onClick={()=>setSelected(new Set())}>{t("Clear selection","বাছাই বাতিল")}</button></div>}
        {shown.length ? view==="grid"?<div className="product-grid">{shown.map((p,i)=><ProductCard key={p.id} p={p} idx={(activePage-1)*pageSize+i} selected={selected.has(p.id)} t={t} onSelect={()=>toggle(p.id)} onOpen={()=>setEdit(p)}/>)}</div>:
        <div className="table-scroll"><table className="products-table"><thead><tr><th aria-label="Selection"></th><th>{t("Product","পণ্য")}</th><th>{t("Barcode / code","বারকোড / কোড")}</th><th>{t("Weight / size","পরিমাণ")}</th><th>{t("Category","বিভাগ")}</th><th/></tr></thead><tbody>{shown.map(p=><tr key={p.id}><td><input type="checkbox" aria-label={t("Select ","বাছাই ")+(p.nameEn||p.nameBn)} checked={selected.has(p.id)} onChange={()=>toggle(p.id)}/></td><td><button className="table-prod" onClick={()=>setEdit(p)}><span className="table-photo"><ProductPhoto product={p} t={t}/></span><span><b>{p.nameEn||p.originalName||p.nameBn}</b><small lang="bn">{p.nameBn||"—"}</small></span></button></td><td><span className="cell-code">{p.code||"—"}</span><small>{p.codeType}</small></td><td>{p.size||"—"}</td><td>{p.category||"—"}</td><td><button className="icon-control" aria-label={t("View product details","পণ্যের তথ্য দেখুন")} onClick={()=>setEdit(p)}><ChevronRight size={16}/></button></td></tr>)}</tbody></table></div>:
        <div className="empty-state">{busy?<LoaderCircle className="spin"/>:<Search/>}<h3>{busy?t("Looking for products…","পণ্য খোঁজা হচ্ছে…"):t("No matching products","কোনো পণ্য মেলেনি")}</h3><p>{busy?t("Products appear here as the store is read.","দোকান থেকে পণ্য পাওয়ামাত্র এখানে দেখাবে।"):t("Try another name, barcode or category.","অন্য নাম, কোড বা বিভাগ দিয়ে চেষ্টা করুন।")}</p>{(search||category)&&<button className="secondary" onClick={()=>{setSearch("");setCategory("");setPage(1);}}>{t("Clear filters","ফিল্টার মুছুন")}</button>}</div>}
        {filtered.length>0&&<div className="catalog-bottom"><span>{t("Showing ","দেখানো হচ্ছে ")}{fmt((activePage-1)*pageSize+1)}–{fmt(Math.min(activePage*pageSize,filtered.length))} {t("of","/")} {fmt(filtered.length)} {t("products","পণ্য")}</span>
        {pages>1&&<div className="pager"><button className="icon-control" aria-label={t("Previous page","আগের পৃষ্ঠা")} disabled={activePage===1} onClick={()=>setPage(activePage-1)}><ChevronLeft size={16}/></button><span>{fmt(activePage)} / {fmt(pages)}</span><button className="icon-control" aria-label={t("Next page","পরের পৃষ্ঠা")} disabled={activePage===pages} onClick={()=>setPage(activePage+1)}><ChevronRight size={16}/></button></div>}</div>}
      </section>
    </>:<section className="history-page"><button className="text-button" onClick={()=>setTab("work")}><ArrowLeft size={15}/>{t("Workspace","ওয়ার্কস্পেস")}</button><h1>{t("Import history","আমদানির ইতিহাস")}</h1><p>{t("Reopen store catalogs saved in this browser.","এই ব্রাউজারে সংরক্ষিত দোকানের ক্যাটালগ আবার খুলুন।")}</p>
      {history.length?<div className="history-list">{history.map(c=><button key={c.key} onClick={()=>open(c)}><span className="history-icon"><Store size={21}/></span><span><b>{siteHost(c.site)}</b><small>{new Date(c.date).toLocaleString(locale)} · {fmt(c.products.length)} {t("products","পণ্য")}{c.cursor?t(" · Paused"," · থামানো হয়েছে"):""}</small></span><ChevronRight size={18}/></button>)}</div>:<div className="empty-state"><FolderOpen size={30}/><h3>{t("No imports yet","এখনও কোনো আমদানি হয়নি")}</h3><p>{t("Enter a store website in the workspace to start your first import.","প্রথম আমদানির জন্য ওয়ার্কস্পেসে দোকানের ওয়েবসাইট লিখুন।")}</p><button className="primary" onClick={()=>setTab("work")}>{t("Open workspace","ওয়ার্কস্পেস খুলুন")}<ArrowRight size={16}/></button></div>}
      <button className="sample-history" onClick={()=>open(demo)}><Package size={19}/><span>{t("Open the Chaldal sample catalog","চালডালের নমুনা ক্যাটালগ দেখুন")}</span><ArrowUpRight size={16}/></button>
      <CloudBackups catalog={catalog} importing={busy} locale={locale} onRestore={open} onSaved={announce} t={t}/>
    </section>}</main>
    {panel==="help"&&<Modal title={t("Using CatalogMint","CatalogMint ব্যবহার")} onClose={()=>setPanel(null)}><div className="dialog-content help-content">
      <div><Globe2/><section><h3>{t("Start with a store website","দোকানের ওয়েবসাইট দিন")}</h3><p>{t("Paste the homepage, such as chaldal.com. CatalogMint reads public product feeds, category pages and sitemaps. Keep the tab open during import or pause and resume from history.","হোমপেজের ঠিকানা দিন, যেমন chaldal.com। এটি প্রকাশ্য পণ্যের ফিড, বিভাগীয় পৃষ্ঠা ও সাইটম্যাপ পড়ে। আমদানির সময় ট্যাব খোলা রাখুন, অথবা থামিয়ে পরে ইতিহাস থেকে আবার শুরু করুন।")}</p></section></div>
      <div><Barcode/><section><h3>{t("Review product details","পণ্যের তথ্য যাচাই করুন")}</h3><p>{t("Open a product to edit either name, the code or the size. Barcodes, SKUs and store IDs retain their source labels. You can request name translations through MyMemory.","পণ্যে ক্লিক করে নাম, কোড বা পরিমাণ সম্পাদনা করুন। বারকোড, SKU ও দোকানের আইডি আলাদা থাকে। চাইলে MyMemory থেকে নামের অনুবাদ নিতে পারবেন।")}</p></section></div>
      <div><ArrowDownToLine/><section><h3>{t("Export your catalog","ক্যাটালগ এক্সপোর্ট করুন")}</h3><p>{t("Select individual products or export all loaded items. PDF, Excel and Word embed available photos. CSV and text include the original image URLs.","পণ্য বাছাই করুন বা পাওয়া সব পণ্য এক্সপোর্ট করুন। PDF, Excel ও Word-এ প্রাপ্ত ছবি থাকবে। CSV ও Text-এ মূল ছবির লিংক থাকবে।")}</p></section></div>
      <p className="field-hint">{t("Stores that require sign-in, block automated access or expose only some listings can return a partial or empty catalog.","লগইন প্রয়োজন হলে, স্বয়ংক্রিয় অ্যাক্সেস বন্ধ থাকলে বা কিছু পণ্য প্রকাশ্য হলে ক্যাটালগ আংশিক বা খালি হতে পারে।")}</p>
    </div></Modal>}
    {panel==="export"&&<ExportPanel products={catalog.products} selected={selected} site={catalog.site} locale={locale} t={t} onClose={()=>setPanel(null)} onDone={msg=>{setPanel(null);announce(msg);}}/>}
    {panel==="translate"&&<TranslatePanel products={catalog.products} t={t} onClose={()=>setPanel(null)} onApply={map=>{const c=latest.current;assign({...c,products:c.products.map(p=>({...p,...map.get(p.id)}))});setPanel(null);announce(t("Updated "+map.size+" products.","হালনাগাদ হয়েছে "+map.size+"টি পণ্য।"));}}/>}
    {edit&&<EditPanel p={edit} t={t} onClose={()=>setEdit(null)} onSave={updateProduct}/>}
    {toast&&<div className="toast" role="status"><Info size={16}/><span>{toast}</span><button className="bare" aria-label={t("Dismiss","বন্ধ করুন")} onClick={()=>setToast("")}><X size={14}/></button></div>}
  </div>;
}
function TranslatePanel({products,t,onClose,onApply}:{products:Product[];t:(a:string,b:string)=>string;onClose:()=>void;onApply:(m:Map<string,Partial<Product>>)=>void}){
  const [running,setRunning]=useState(false),[progress,setProgress]=useState(0),[note,setNote]=useState("");
  const updates=useRef(new Map<string,Partial<Product>>()),ctrl=useRef<AbortController|null>(null);
  const targets=products.filter(p=>(!p.nameBn||!p.nameEn)&&(p.nameEn||p.nameBn||p.originalName));
  useEffect(()=>()=>{ctrl.current?.abort();},[]);
  async function run(){setRunning(true);setNote("");const c=new AbortController();ctrl.current=c;let count=0;
    try{for(const p of targets){for(const target of ["en","bn"] as const){const field=target==="en"?"nameEn":"nameBn";if(p[field]||updates.current.get(p.id)?.[field])continue;
      const name=target==="en"?p.nameBn:p.nameEn,src=name?(target==="en"?"bn":"en"):p.language||"en";
      const text=await translated(name||p.originalName||"",src,target,c.signal);
      updates.current.set(p.id,{...updates.current.get(p.id),[field]:text});
    }setProgress(++count);}onApply(updates.current);}
    catch{if(!c.signal.aborted)setNote(t("The translation service is unavailable or its quota was reached. Save any completed names and edit the rest manually.","অনুবাদ সেবা পাওয়া যায়নি বা ব্যবহারের সীমা পূর্ণ হয়েছে। পাওয়া নামগুলো সংরক্ষণ করে বাকিগুলো সম্পাদনা করতে পারেন।"));}
    finally{setRunning(false);}
  }
  return <Modal title={t("Translate missing names","অনুপস্থিত নাম অনুবাদ")} onClose={()=>{ctrl.current?.abort();if(updates.current.size)onApply(updates.current);else onClose();}}><div className="dialog-content"><p>{t("Send missing-name requests to MyMemory for "+targets.length+" products. Existing names are preserved. Review machine translations before export.","মোট "+targets.length+"টি পণ্যের অনুপস্থিত নামের অনুবাদ MyMemory থেকে আনা হবে। আগে থাকা নামগুলো সংরক্ষিত থাকবে। এক্সপোর্টের আগে অনুবাদ যাচাই করুন।")}</p>{note&&<p role="alert" className="error-note">{note}</p>}</div><div className="dialog-foot"><span>{running?progress+" / "+targets.length:""}</span>{note?<button className="primary" onClick={()=>onApply(updates.current)}>{t("Save completed names","প্রাপ্ত নাম সংরক্ষণ")}</button>:<button className="primary" disabled={running} onClick={run}>{running?<LoaderCircle className="spin" size={15}/>:<Languages size={16}/>} {t("Translate names","নাম অনুবাদ")}</button>}</div></Modal>;
}
