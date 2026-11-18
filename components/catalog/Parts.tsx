"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, Barcode, Check, ChevronRight, FileText, FileType2, Globe2, Image as ImageIcon, Languages, LoaderCircle, Package, Ruler, Sheet, Table2, X } from "lucide-react";
import { lookupName, TranslationError } from "@/lib/catalog/translation";
import { productImage, siteHost } from "@/lib/catalog/types";
import type { Format, Locale, Product } from "@/lib/catalog/types";

export type T = (en:string,bn:string)=>string;
export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 36 36" fill="none"><path d="m18 3.8 13.1 7.4v14.7L18 33.2 4.9 25.9V11.2L18 3.8Z" fill="#e6f4cc"/><path d="m5.8 11.9 12.2 7 12.2-7M18 18.9v13.1M11.4 8.2l12.8 7.2v6.1" stroke="#185440" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;
}
export function ProductPhoto({product,t}:{product:Product;t:T}) {
  const [step,setStep]=useState(0);
  const link=step===0 ? productImage(product) : step===1 && product.imageUrl!==productImage(product) ? product.imageUrl : "";
  if(!link) return <span className="no-photo"><ImageIcon size={25}/><small>{t("Image unavailable","ছবি পাওয়া যায়নি")}</small></span>;
  return <img className="product-photo" src={link} alt={product.nameEn || product.nameBn || product.originalName || "Product"} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setStep(s=>s+1)}/>;
}
export const tones=["rose","lime","blue","sand","aqua","lilac"];
export function ProductCard({p,idx,selected,t,onSelect,onOpen}:{p:Product;idx:number;selected:boolean;t:T;onSelect:()=>void;onOpen:()=>void}) {
  return <article className={"product-card"+(selected?" is-selected":"")}>
    <div className={"photo-stage "+tones[idx%tones.length]}>
      <button className="photo-open" onClick={onOpen} aria-label={t("View details for ","পণ্যের তথ্য দেখুন ")+(p.nameEn||p.nameBn||p.originalName)}><ProductPhoto product={p} t={t}/></button>
      {p.category && <span className="category-tag">{p.category}</span>}
      <label className="card-check"><input type="checkbox" checked={selected} onChange={onSelect} aria-label={t("Select ","বাছাই করুন ")+(p.nameEn||p.nameBn||p.originalName)}/><span><Check size={14} strokeWidth={3}/></span></label>
    </div>
    <div className="card-body"><button className="name-btn" onClick={onOpen}><span>{p.nameEn||p.originalName||p.nameBn}</span><ChevronRight size={17}/></button>
    <div className={"bn-name"+(!p.nameBn?" missing":"")} lang={p.nameBn?"bn":undefined}>{p.nameBn || t("Add Bangla name","বাংলা নাম যোগ করুন")}</div>
    <div className="card-meta"><span title={p.codeType}><Barcode size={16}/><span className="code-label">{p.codeType || t("Code","কোড")}</span><b>{p.code||"—"}</b></span><span title={t("Weight / size","পরিমাণ ও ইউনিট")}><Package size={15}/><b>{p.size||"—"}</b></span></div></div>
  </article>;
}
export function Modal({title,onClose,children,wide=false,eyebrow}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean;eyebrow?:string}) {
  const ref=useRef<HTMLDialogElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{const dialog=ref.current,old=document.activeElement as HTMLElement | null;dialog?.showModal();const oldStyle=document.body.style.overflow;document.body.style.overflow="hidden";return ()=>{dialog?.close();document.body.style.overflow=oldStyle;old?.focus();};},[]);
  return <dialog ref={ref} className={"panel-dialog"+(wide?" wide":"")} aria-label={title} onCancel={e=>{e.preventDefault();close.current();}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close.current();}}}>
    <div className="dialog-head"><div>{eyebrow&&<p className="overline">{eyebrow}</p>}<h2>{title}</h2></div><button className="icon-control" aria-label="Close / বন্ধ করুন" onClick={onClose}><X size={19}/></button></div>{children}
  </dialog>;
}
const formats:{id:Format;name:string;ext:string;Icon:typeof FileText}[]=[
  {id:"xlsx",name:"Excel",ext:".xlsx",Icon:Sheet},{id:"pdf",name:"PDF",ext:".pdf",Icon:FileType2},{id:"csv",name:"CSV",ext:".csv",Icon:Table2},{id:"docx",name:"Word",ext:".docx",Icon:FileText},{id:"txt",name:"Text",ext:".txt",Icon:FileText},
];
export function ExportPanel({products,selected,site,t,locale,onClose,onDone}:{products:Product[];selected:Set<string>;site:string;t:T;locale:Locale;onClose:()=>void;onDone:(message:string)=>void}) {
  const [format,setFormat]=useState<Format>("xlsx"),[scope,setScope]=useState(selected.size?"selected":"all");
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[err,setErr]=useState("");
  const list=scope==="selected"?products.filter(p=>selected.has(p.id)):products;
  const embedded=["xlsx","pdf","docx"].includes(format);
  async function download(){
    setBusy(true);setErr("");
    try {const {exportProducts}=await import("@/lib/catalog/export");
      const result=await exportProducts(format,list,site,(n)=>setProgress(n));
      onDone(result.missing ? t("Downloaded. "+result.missing+" product photos were unavailable. Available image links are included.","ডাউনলোড হয়েছে। "+result.missing+"টি পণ্যের ছবি পাওয়া যায়নি। প্রাপ্ত ছবির লিংক রাখা হয়েছে।") : t("Downloaded "+result.filename,"ডাউনলোড হয়েছে "+result.filename));
    } catch {setErr(t("The file could not be prepared. Try again or export a smaller selection.","ফাইল তৈরি হয়নি। আবার চেষ্টা করুন বা কম পণ্য বাছাই করুন।"));setBusy(false);}
  }
  return <Modal title={t("Export catalog","ক্যাটালগ এক্সপোর্ট")} eyebrow={siteHost(site)} onClose={()=>{if(!busy)onClose();}}>
    <div className="dialog-content"><fieldset><legend>{t("Products to include","কোন পণ্যগুলো রাখবেন")}</legend><div className="scope-options">
      <label><input type="radio" name="scope" checked={scope==="all"} disabled={busy} onChange={()=>setScope("all")}/>{t("All loaded products","লোড হওয়া সব পণ্য")}<b>{products.length.toLocaleString(locale)}</b></label>
      <label className={!selected.size?"muted":""}><input type="radio" name="scope" checked={scope==="selected"} disabled={!selected.size||busy} onChange={()=>setScope("selected")}/>{t("Selected products","বাছাই করা পণ্য")}<b>{selected.size.toLocaleString(locale)}</b></label></div></fieldset>
      <fieldset><legend>{t("File format","ফাইলের ধরন")}</legend><div className="format-grid">{formats.map(({id,name,ext,Icon})=><button type="button" aria-pressed={format===id} className={"format"+(format===id?" chosen":"")} disabled={busy} key={id} onClick={()=>setFormat(id)}><Icon size={22}/><strong>{name}</strong><small>{ext}</small>{format===id&&<Check className="format-check" size={13}/>}</button>)}</div></fieldset>
      <p className="inline-note"><ImageIcon size={17}/>{embedded?t("Available original product photos are embedded in this file.","প্রাপ্ত মূল পণ্যের ছবিগুলো এই ফাইলে থাকবে।"):t("Each row includes the original image URL and the product page URL.","প্রতিটি পণ্যের সঙ্গে মূল ছবি ও পণ্যের পৃষ্ঠার লিংক থাকবে।")}</p>
      {err&&<p role="alert" className="error-note">{err}</p>}
    </div><div className="dialog-foot"><span>{list.length.toLocaleString(locale)} {t("products","টি পণ্য")}</span><button className="primary" disabled={busy||!list.length} onClick={download}>{busy?<LoaderCircle size={17} className="spin"/>:<ArrowDownToLine size={17}/>}
      {busy?(progress>0?t("Preparing "+progress+"/"+list.length,"প্রস্তুত হচ্ছে "+progress+"/"+list.length):t("Preparing file…","ফাইল তৈরি হচ্ছে…")):t("Download file","ফাইল ডাউনলোড")}</button></div>
  </Modal>;
}
export async function translated(text:string,from:string,to:"en"|"bn",signal?:AbortSignal) {
  // Direct public requests use the visitor's own translation allowance.
  // Only fall back to the site route if the browser cannot reach the service.
  try { return await lookupName(text,from,to,signal); }
  catch (error) {
    if (signal?.aborted || error instanceof TranslationError) throw error;
  }
  const r=await fetch("/api/translate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text,from,to}),signal});
  if(!r.ok)throw new Error("Translation unavailable"); return (await r.json() as {text:string}).text;
}
export function EditPanel({p,t,onClose,onSave}:{p:Product;t:T;onClose:()=>void;onSave:(p:Product)=>void}) {
  const [values,setValues]=useState({...p}),[busy,setBusy]=useState(false),[err,setErr]=useState("");
  function change(key:keyof Product,value:string){setValues(v=>({...v,[key]:value}));}
  async function suggest(target:"en"|"bn"){
    const name=target==="bn"?values.nameEn:values.nameBn,src=name?(target==="bn"?"en":"bn"):values.language||"en";
    setBusy(true);setErr("");try{change(target==="bn"?"nameBn":"nameEn",await translated(name||values.originalName||"",src,target));}catch{setErr(t("Translation is unavailable. You can type the name here.","অনুবাদ পাওয়া যায়নি। এখানে নাম লিখতে পারেন।"));}finally{setBusy(false);}
  }
  return <Modal wide title={t("Product details","পণ্যের বিস্তারিত")} eyebrow={siteHost(p.sourceUrl)} onClose={onClose}>
    <form onSubmit={e=>{e.preventDefault();if(!values.nameEn.trim()&&!values.nameBn.trim()&&!values.originalName){setErr(t("Enter at least one product name.","অন্তত একটি পণ্যের নাম লিখুন।"));return;}onSave(values);}}>
    <div className="edit-layout"><div className="edit-picture"><div className="detail-photo"><ProductPhoto product={p} t={t}/></div>{p.sourceUrl&&<a href={p.sourceUrl} target="_blank" rel="noreferrer"><Globe2 size={14}/>{t("Product page","পণ্যের পৃষ্ঠা")}<ArrowUpRight size={13}/></a>}{p.imageUrl&&<a href={p.imageUrl} target="_blank" rel="noreferrer"><ImageIcon size={14}/>{t("Original image","মূল ছবি")}<ArrowUpRight size={13}/></a>}</div>
    <div className="edit-fields">{values.originalName&&<p className="field-hint">{t("Original name","মূল নাম")} · {values.originalName}</p>}
    {(["nameEn","nameBn"] as const).map((key,i)=><label key={key}><span className="field-label">{i?t("Bangla name","বাংলা নাম"):t("English name","ইংরেজি নাম")}{!values[key]&&((i?values.nameEn:values.nameBn)||values.originalName)&&<button type="button" className="text-button" disabled={busy} onClick={()=>suggest(i?"bn":"en")}><Languages size={13}/>{t("Translate","অনুবাদ")}</button>}</span><input value={values[key]} onChange={e=>change(key,e.target.value)} placeholder={i?"পণ্যের নাম":t("Product name","পণ্যের ইংরেজি নাম")} lang={i?"bn":"en"}/></label>)}
    <div className="field-pair"><label>{t("Code type","কোডের ধরন")}<select value={values.codeType||"Code"} onChange={e=>change("codeType",e.target.value)}>{["Barcode","SKU","Product ID","MPN","Code"].map(x=><option key={x}>{x}</option>)}</select></label><label>{t("Barcode / code","বারকোড / কোড")}<input value={values.code} onChange={e=>change("code",e.target.value)}/></label></div>
    <label>{t("Weight / size & unit","পরিমাণ ও ইউনিট")}<input value={values.size} placeholder={t("e.g. 150 g or XL","যেমন ১৫০ গ্রাম বা XL")} onChange={e=>change("size",e.target.value)}/></label>
    <label>{t("Category","বিভাগ")}<input value={values.category} onChange={e=>change("category",e.target.value)}/></label>
    {err&&<p role="alert" className="error-note">{err}</p>}</div></div>
    <div className="dialog-foot"><span>{t("Edits are saved on this device.","পরিবর্তন এই ডিভাইসে সংরক্ষিত হয়।")}</span><button type="submit" disabled={busy} className="primary"><Check size={16}/>{t("Save changes","সংরক্ষণ")}</button></div></form>
  </Modal>;
}
