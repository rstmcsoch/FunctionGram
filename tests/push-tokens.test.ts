import assert from "node:assert/strict";
import test from "node:test";
import { parseDeviceToken, parsePushPlatform } from "../lib/push-token-policy";

test("device tokens are opaque android registration tokens, not secrets", () => {
  const token = "a".repeat(20) + ":APA91b_example-token.1";
  assert.equal(parseDeviceToken(token), token);
  assert.equal(parseDeviceToken("  " + token + "  "), token);
  assert.equal(parseDeviceToken("short"), null);
  assert.equal(parseDeviceToken("has space " + "a".repeat(20)), null);
  assert.equal(parseDeviceToken("libsql://example.invalid"), null);
  assert.equal(parsePushPlatform(undefined), "android");
  assert.equal(parsePushPlatform("android"), "android");
  assert.equal(parsePushPlatform("ios"), null);
});
