export function plain(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/<[^>]*>/g, " ").replace(/&(amp|quot|apos|lt|gt|nbsp|#39|#x27|#\d+|#x[\da-f]+);/gi, (m,k:string) => {
    const map: Record<string,string> = {amp:"&",quot:'"',apos:"'",lt:"<",gt:">",nbsp:" ","#39":"'","#x27":"'"};
    if (map[k]) return map[k];
    const n = /^#x/i.test(k) ? parseInt(k.slice(2),16) : Number(k.slice(1));
    return Number.isInteger(n) && n>0 && n<=0x10ffff ? String.fromCodePoint(n) : m;
  }).replace(/\s+/g," ").trim().slice(0,1000);
}
