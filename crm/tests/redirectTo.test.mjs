import test from "node:test";
import assert from "node:assert/strict";
import { extraHosts, publicOrigin } from "../lib/redirectToMath.ts";

const h = (o) => ({ get: (k) => o[k] ?? null });
const allowed = ["127.0.0.1:3000", "localhost:3000", "office-mac.tail1.ts.net"];

test("redirects follow the address the browser used, only when it is one of ours", () => {
  assert.equal(publicOrigin(h({ host: "office-mac.tail1.ts.net", "x-forwarded-host": "office-mac.tail1.ts.net", "x-forwarded-proto": "https" }), "http://localhost:3000/", allowed), "https://office-mac.tail1.ts.net");
  assert.equal(publicOrigin(h({ host: "127.0.0.1:3000" }), "http://localhost:3000/", allowed), "http://127.0.0.1:3000");
  assert.equal(publicOrigin(h({ host: "evil.example.com", "x-forwarded-proto": "https" }), "http://localhost:3000/", allowed), "http://localhost:3000");
  assert.equal(publicOrigin(h({ host: "office-mac.tail1.ts.net", "x-forwarded-host": "evil.example.com" }), "http://localhost:3000/", allowed), "http://localhost:3000");
});

test("CRM_EXTRA_ORIGINS is read leniently but never takes wildcards", () => {
  assert.deepEqual(extraHosts(" https://Office-Mac.tail1.ts.net/ , *.ts.net,"), ["office-mac.tail1.ts.net"]);
  assert.deepEqual(extraHosts(""), []);
});
