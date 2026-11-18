"use client";
import { useEffect, useState } from "react";
import { ChevronRight, Cloud, LoaderCircle, RefreshCw, Upload } from "lucide-react";
import { listCloudCatalogs, loadCloudCatalog, saveCloudCatalog, type CloudCatalog } from "@/lib/catalog/cloud";
import { siteHost, type Catalog, type Locale } from "@/lib/catalog/types";

export function CloudBackups({ catalog, importing, locale, onRestore, onSaved, t }: {
  catalog: Catalog;
  importing: boolean;
  locale: Locale;
  onRestore: (catalog: Catalog) => void;
  onSaved: (message: string) => void;
  t: (en: string, bn: string) => string;
}) {
  const [items, setItems] = useState<CloudCatalog[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [working, setWorking] = useState(true), [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    listCloudCatalogs().then(data => {
      if (!active) return;
      setItems(data.items); setNextOffset(data.nextOffset); setReady(true);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Cloud backups are unavailable."); })
      .finally(() => { if (active) setWorking(false); });
    return () => { active = false; };
  }, []);

  async function refresh(offset = 0) {
    setWorking(true); setError("");
    try {
      const data = await listCloudCatalogs(offset);
      setItems(old => offset ? [...old, ...data.items] : data.items);
      setNextOffset(data.nextOffset); setReady(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Cloud backups are unavailable."); }
    finally { setWorking(false); }
  }
  async function save() {
    setWorking(true); setError("");
    try {
      await saveCloudCatalog(catalog);
      onSaved(t("Catalog backed up to the cloud.", "ক্লাউডে ক্যাটালগের ব্যাকআপ রাখা হয়েছে।"));
      const data = await listCloudCatalogs();
      setItems(data.items); setNextOffset(data.nextOffset);
    } catch (e) { setError(e instanceof Error ? e.message : "This backup could not be saved."); }
    finally { setWorking(false); }
  }
  async function restore(key: string) {
    setWorking(true); setError("");
    try { onRestore(await loadCloudCatalog(key)); }
    catch (e) { setError(e instanceof Error ? e.message : "This backup could not be restored."); }
    finally { setWorking(false); }
  }
  return <section className="cloud-backups" aria-labelledby="cloud-title" aria-busy={working}>
    <div className="cloud-heading"><div><h2 id="cloud-title"><Cloud size={21}/>{t("Cloud backups", "ক্লাউড ব্যাকআপ")}</h2>
      <p>{t("Save a snapshot of your current catalog, then reopen it here.", "বর্তমান ক্যাটালগের ব্যাকআপ রেখে পরে এখান থেকে খুলুন।")}</p></div>
      <button className="secondary" onClick={() => void refresh()} disabled={working} aria-label={t("Refresh cloud backups", "ক্লাউড ব্যাকআপ আবার দেখুন")}><RefreshCw size={16}/>{t("Refresh", "রিফ্রেশ")}</button></div>
    <div className="cloud-save"><span>{catalog.demo ? t("Import a store to create your first backup.", "প্রথম ব্যাকআপের জন্য দোকানের পণ্য আমদানি করুন।") : t("Current catalog: ", "বর্তমান ক্যাটালগ: ") + siteHost(catalog.site)}</span>
      <button className="primary" disabled={!ready || working || importing || catalog.demo || !catalog.products.length} onClick={() => void save()}><Upload size={16}/>{t("Save to cloud", "ক্লাউডে রাখুন")}</button></div>
    {working && <p className="cloud-status" role="status"><LoaderCircle className="spin" size={16}/>{t("Updating cloud backups…", "ক্লাউড ব্যাকআপ হালনাগাদ হচ্ছে…")}</p>}
    {error && <p className="error-note" role="alert">{error}</p>}
    {!working && ready && !items.length && !error && <p className="field-hint">{t("No cloud backups yet.", "এখনও কোনো ক্লাউড ব্যাকআপ নেই।")}</p>}
    {items.length > 0 && <div className="history-list">{items.map(item => <button key={item.key} disabled={working || importing} onClick={() => void restore(item.key)}>
      <span className="history-icon"><Cloud size={21}/></span><span><b>{siteHost(item.site)}</b><small>{new Date(item.updatedAt).toLocaleString(locale)} · {item.productCount.toLocaleString(locale)} {t("products", "পণ্য")}</small></span><ChevronRight size={18}/>
    </button>)}</div>}
    {nextOffset !== null && <button className="secondary cloud-more" disabled={working} onClick={() => void refresh(nextOffset)}>{t("More backups", "আরও ব্যাকআপ")}</button>}
    <p className="field-hint cloud-note">{t("Backups belong to this browser through a cookie. Another device has separate history. Clearing cookies removes access to these backups. Save again after editing to update the snapshot.", "কুকির মাধ্যমে ব্যাকআপ এই ব্রাউজারের সঙ্গে যুক্ত থাকে। অন্য ডিভাইসে আলাদা ইতিহাস দেখাবে। কুকি মুছে ফেললে এই ব্যাকআপগুলো আর খোলা যাবে না। সম্পাদনার পর ব্যাকআপ হালনাগাদ করতে আবার সংরক্ষণ করুন।")}</p>
  </section>;
}
