export type Product = {
  id: string;
  nameEn: string;
  nameBn: string;
  code: string;
  codeType: string;
  size: string;
  category: string;
  sourceUrl: string;
  imageUrl: string;
  localImage?: string;
  originalName?: string;
  language?: string;
};
export type Rule = { allow: boolean; path: string };
export type Task = { kind: "page" | "map" | "category"; url: string; label?: string; offset?: number; retry?: 1 };
export type Cursor = {
  origin: string;
  engine: "Shopify" | "WooCommerce" | "Store pages" | "Chaldal";
  page: number;
  tasks: Task[];
  seen: string[];
  rules: Rule[];
};
export type Batch = {
  products: Product[];
  cursor: Cursor | null;
  method: Cursor["engine"];
  skipped: number;
  limited: boolean;
};
export type Catalog = {
  key: string;
  site: string;
  date: string;
  products: Product[];
  cursor: Cursor | null;
  method: string;
  skipped: number;
  limited: boolean;
  demo?: boolean;
};
export type Format = "pdf" | "xlsx" | "csv" | "docx" | "txt";
export type Locale = "en" | "bn";
export function productImage(product: Product) {
  return product.localImage || (product.imageUrl ? "/api/image?url=" + encodeURIComponent(product.imageUrl) : "");
}
export function siteHost(value: string) {
  try { return new URL(value).hostname.replace(/^www\./i, ""); } catch { return value; }
}
