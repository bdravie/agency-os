import test from "node:test";
import assert from "node:assert/strict";
import { normaliseEmail } from "../lib/contact.ts";

test("a named or personal email is refused with a plain reason, never accepted", () => {
  assert.match(normaliseEmail("sam.example@oakwood-dental.co.uk").error, /Only generic company addresses/);
  assert.match(normaliseEmail("sam@gmail.com").error ?? "", /./);
  assert.equal(normaliseEmail("info@oakwood-dental.co.uk").error, undefined);
  assert.equal(normaliseEmail("Hello@Oakwood-Dental.co.uk").value, "hello@oakwood-dental.co.uk");
});
