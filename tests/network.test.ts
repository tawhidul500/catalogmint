import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicAddress } from "../lib/server/public-network";
import { publicUrl } from "../lib/catalog/network";

test("reject private, metadata, loopback, mapped, and reserved destinations", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "2001:db8::1"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  for (const url of ["file:///etc/passwd", "https://127.0.0.1", "http://0x7f000001", "http://user:pass@shop.com", "http://shop.com:3000", "http://service.internal"]) assert.throws(() => publicUrl(url), url);
});
