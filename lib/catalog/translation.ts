import { plain } from "./text";
export class TranslationError extends Error {
  status:number;
  constructor(message:string,status:number) {super(message);this.status=status;}
}
export async function lookupName(text:string,from:string,to:string,signal?:AbortSignal):Promise<string> {
  if(typeof text!=="string" || !text.trim() || new TextEncoder().encode(text).length>500 || !/^[a-z]{2,3}$/i.test(from) || !["en","bn"].includes(to) || from===to) {
    throw new TranslationError("The name cannot be translated automatically. You can enter it manually.",400);
  }
  const url=new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q",text);url.searchParams.set("langpair",from+"|"+to);
  const controller=new AbortController();
  const abort=()=>controller.abort();
  const timer=setTimeout(abort,18000);
  signal?.addEventListener("abort",abort,{once:true});
  if(signal?.aborted)abort();
  try {
    const r=await fetch(url.href,{signal:controller.signal,credentials:"omit",referrerPolicy:"no-referrer",headers:{Accept:"application/json"}});
    if(!r.ok)throw new TranslationError("The translation service is unavailable.",r.status===429?429:503);
    const j=await r.json() as {responseStatus:number;quotaFinished?:boolean;responseData?:{translatedText?:string}};
    const value=plain(j.responseData?.translatedText);
    if(j.quotaFinished || Number(j.responseStatus)===429)throw new TranslationError("Translation quota reached. You can enter the name manually.",429);
    if(Number(j.responseStatus)!==200 || !value || /MYMEMORY WARNING|INVALID LANGUAGE PAIR/i.test(value) || (to==="bn"&&!/[\u0980-\u09ff]/.test(value))) throw new TranslationError("A translation was not available for this name.",422);
    return value;
  } finally {clearTimeout(timer);signal?.removeEventListener("abort",abort);}
}
