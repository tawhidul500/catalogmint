import "server-only";
import { lookup } from "node:dns";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent } from "undici";

export function isPublicAddress(address: string): boolean {
  try { return ipaddr.parse(address).range() === "unicast"; }
  catch { return false; }
}

// Resolve and validate at socket creation so a hostname cannot switch to a
// private address between a preliminary DNS check and the actual connection.
export const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { all: true, family: options.family, hints: options.hints }, (error, addresses) => {
    if (error) return callback(error, "");
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) {
      return callback(Object.assign(new Error("A store must resolve to a public internet address."), { code: "EACCES" }), "");
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
};

export const publicDispatcher = new Agent({
  connect: { lookup: publicLookup, timeout: 12_000 },
  connections: 4,
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 30_000,
});
