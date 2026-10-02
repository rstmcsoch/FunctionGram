import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const commonPath = new URL("../components/social/common.tsx", import.meta.url);
const cssPath = new URL("../app/globals.css", import.meta.url);

test("message avatars have fixed square geometry and crop images without distortion", async () => {
  const common = await readFile(commonPath, "utf8");
  const css = await readFile(cssPath, "utf8");

  assert.match(common, /minWidth: size/);
  assert.match(common, /minHeight: size/);
  assert.match(common, /maxWidth: size/);
  assert.match(common, /maxHeight: size/);
  assert.match(common, /aspectRatio: "1 \/ 1"/);

  assert.match(css, /\.avatar\{[^}]*aspect-ratio:1 \/ 1/);
  assert.match(css, /\.avatar img\{[^}]*object-fit:cover/);
  assert.match(css, /\.avatar img\{[^}]*object-position:center/);
  assert.match(css, /\.avatar img\{[^}]*max-width:none/);
  assert.match(css, /\.avatar img\{[^}]*max-height:none/);
});
