import type { Catalog } from "./types";
let opening: Promise<IDBDatabase> | undefined;
function database() {
  if (!opening) opening=new Promise((resolve,reject)=>{
    const req=indexedDB.open("catalogmint-workspace",1);
    req.onupgradeneeded=()=>{req.result.createObjectStore("catalogs",{keyPath:"key"});};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>{opening=undefined;reject(req.error);};
  });
  return opening;
}
export async function savedCatalogs():Promise<Catalog[]> {
  const db=await database();
  return new Promise((resolve,reject)=>{const req=db.transaction("catalogs").objectStore("catalogs").getAll();req.onsuccess=()=>resolve(req.result as Catalog[]);req.onerror=()=>reject(req.error);});
}
export async function saveCatalog(c:Catalog) {
  const db=await database();
  return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction("catalogs","readwrite");
    tx.objectStore("catalogs").put(c);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
