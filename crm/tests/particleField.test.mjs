import test from "node:test";
import assert from "node:assert/strict";
import { dotCount } from "../lib/particleField.ts";

test("dotCount: 15% more particles, kept between 12 and 51", () => {
  assert.equal(dotCount(0, 0), 12);
  assert.equal(dotCount(300, 180), 12);
  assert.equal(dotCount(1100, 220), 25);
  assert.equal(dotCount(1280, 320), 43);
  assert.equal(dotCount(2400, 800), 51);
});
