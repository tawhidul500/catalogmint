import type { Rule } from "./types";
import { publicDispatcher } from "@/lib/server/public-network";

export class CatalogError extends Error {
  status: number;
  constructor(message: string, status = 422) { super(message); this.status = status; }
}

export function publicUrl(value: unknown, base?: string): URL {
  if (typeof value !== "string" || value.length > 4096) throw new CatalogError("Enter a valid public store website address.", 400);
  let url: URL;
  try { url = new URL(value, base); } catch { throw new CatalogError("Enter a valid store address, such as https://shop.com.", 400); }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port || !host.includes(".") ||
      !/^[a-z0-9.-]+$/.test(host) || /^[\d.]+$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|lan|test|invalid|onion|home|corp|arpa)$/.test(host)) {
    throw new CatalogError("Use a public store website with an HTTP or HTTPS address.", 400);
  }
  url.hash = "";
  return url;
}
export function storeUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new CatalogError("Enter a store website to start.", 400);
  const text = value.trim();
  return publicUrl(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : "https://" + text);
}
export function sameShop(a: URL, b: URL) {
  const norm = (host: string) => host.toLowerCase().replace(/\.$/,"").replace(/^www\./,"");
  return norm(a.hostname) === norm(b.hostname);
}

export async function readPublic(url: URL, options: { limit?: number; image?: boolean; shop?: URL; rules?: Rule[]; timeout?: number } = {}) {
  let current = publicUrl(url.href);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout ?? (options.image ? 14000 : 24000));
  try {
    for (let redirects = 0; redirects < 5; redirects++) {
      if (options.shop && !sameShop(current, options.shop)) throw new CatalogError("A link leads outside this store.");
      if (options.rules && !allowed(current, options.rules)) throw new CatalogError("The store excludes this address from automated imports.", 403);
      const requestOptions: RequestInit & { dispatcher: typeof publicDispatcher } = {
        headers: {
          "User-Agent": "CatalogMintBot/1.0 (public product catalog importer)",
          Accept: options.image ? "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" : "application/json,text/html,application/xml,text/xml,text/plain,*/*;q=0.5",
        },
        redirect: "manual", signal: controller.signal, cache: "no-store", dispatcher: publicDispatcher,
      };
      const response = await fetch(current.href, requestOptions);
      if ([301,302,303,307,308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new CatalogError("The store returned an incomplete redirect.");
        await response.body?.cancel();
        current = publicUrl(location, current.href);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new CatalogError(response.status === 429 ? "The store is limiting requests. Try again later." :
          [401,403].includes(response.status) ? "This store restricts automated access to its public catalog." :
          "The store returned HTTP " + response.status + ".", response.status);
      }
      const limit = options.limit ?? 6_000_000;
      if (Number(response.headers.get("content-length")) > limit) {
        await response.body?.cancel(); throw new CatalogError("This store response is too large to read in one request.", 413);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new CatalogError("The store returned an empty response.");
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        total += item.value.length;
        if (total > limit) { await reader.cancel(); throw new CatalogError("This store response is too large to read in one request.", 413); }
        chunks.push(item.value);
      }
      const bytes = new Uint8Array(total);
      let n = 0;
      for (const chunk of chunks) { bytes.set(chunk, n); n += chunk.length; }
      return { url: current, bytes, headers: response.headers, text: () => new TextDecoder().decode(bytes) };
    }
    throw new CatalogError("The store has redirected too many times.");
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    throw new CatalogError(controller.signal.aborted ? "The store took too long to respond. Try again." : "The store could not be reached. Check its website address and try again.", 502);
  } finally { clearTimeout(timeout); }
}

export function robotRules(text: string) {
  const groups: {agents: string[]; rules: Rule[]}[] = [];
  const maps: string[] = [];
  let group = {agents: [] as string[], rules: [] as Rule[]};
  let directives = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0,colon).trim().toLowerCase(), value = line.slice(colon+1).trim();
    if (key === "sitemap") { if (value) maps.push(value); continue; }
    if (key === "user-agent") {
      if (directives) { groups.push(group); group = {agents: [], rules: []}; directives = false; }
      group.agents.push(value.toLowerCase());
    } else if (group.agents.length) {
      directives = true;
      if ((key === "allow" || key === "disallow") && value && value.length < 750) group.rules.push({allow:key === "allow",path:value});
    }
  }
  groups.push(group);
  const specific = groups.filter(g => g.agents.some(a => a.includes("catalogmint")));
  return {rules:(specific.length ? specific : groups.filter(g => g.agents.includes("*"))).flatMap(g => g.rules), maps};
}
export function allowed(url: URL, rules: Rule[]) {
  let length = -1, ok = true;
  const target = url.pathname + url.search;
  for (const rule of rules) {
    const end = rule.path.endsWith("$");
    const raw = end ? rule.path.slice(0,-1) : rule.path;
    const parts = raw.split("*").map(part => part.replace(/[.*+?^$(){}|[\]\\]/g,"\\$&"));
    const expr = new RegExp("^" + parts.join(".*") + (end ? "$" : ""));
    const score = raw.replace(/\*/g,"").length;
    if (expr.test(target) && (score > length || (score === length && rule.allow))) { length = score; ok = rule.allow; }
  }
  return ok;
}
