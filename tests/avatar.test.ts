/**
 * Avatar crop + compression suite.
 *
 * Covers the three layers the feature is built from: the pure crop/ladder
 * maths shared by the browser and the server, the sharp safety net that
 * re-encodes whatever the browser sends, and the display contract that keeps
 * every rendered avatar a stable circle.
 */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { mkdtempSync, rmSync, readFileSync, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';

// Isolated embedded database for the pipeline and route checks in this file.
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const dataDir = mkdtempSync(path.join(tmpdir(), 'functiongram-avatar-'));
process.env.FUNCTIONGRAM_PGLITE_DIR = dataDir;

import {
  AVATAR_CACHE_CONTROL, AVATAR_CLIENT_MAX_BYTES, AVATAR_MAX_BYTES, AVATAR_MIN, AVATAR_SOURCE_MAX_BYTES, AVATAR_TARGET,
  AVATAR_ZOOM_MAX, AVATAR_ZOOM_MIN, avatarAssetReady, centrePan, clampPan, clampZoom, compressToBudget, coverScale,
  cropRect, halvingSteps, initialCrop, outputSize, panBy, qualitySteps, sizeLadder, zoomAround, type CropState,
} from '../lib/avatar';
import { avatarSourceType, processAvatarImage, processAvatarUpload } from '../lib/avatar-image';
import { DEFAULT_MEDIA } from '../lib/media-config';
import { avatarUpgradeStatements } from '../lib/postgres-schema';
import { DATABASE_MIGRATIONS, ensureSchema, getPool } from '../lib/postgres';
import { reserveClaim, finishWithStore, type UploadStore } from '../lib/uploads';
import { checkAssets } from '../lib/media-policy';
import { Avatar } from '../components/social/common';
import { GET as mediaRoute } from '../app/api/media/[key]/route';

/* --------------------------------- fixtures -------------------------------- */

/** Deterministic pseudo-random noise, so file sizes are stable across runs. */
function grain(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1103515245 + 12345) >>> 0; return value >>> 24; };
}

/** A synthetic portrait: skin-toned oval, eyes, mouth, fine texture and grain. */
function facePixels(width: number, height: number) {
  const data = Buffer.alloc(width * height * 3);
  const next = grain(7);
  const cx = width / 2, cy = height / 2, rx = width * 0.28, ry = height * 0.36;
  const eye = (x: number, y: number, ex: number) => ((x - ex) / (rx * 0.16)) ** 2 + ((y - (cy - ry * 0.22)) / (ry * 0.09)) ** 2 <= 1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const n = next() / 255 - 0.5;
    const i = (y * width + x) * 3;
    let r = 210, g = 170, b = 150;
    if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) { r = 60 + 40 * Math.sin(x / 50); g = 80; b = 110; }
    else if (eye(x, y, cx - rx * 0.38) || eye(x, y, cx + rx * 0.38)) { r = 40; g = 40; b = 45; }
    else if (((x - cx) / (rx * 0.42)) ** 2 + ((y - (cy + ry * 0.42)) / (ry * 0.08)) ** 2 <= 1) { r = 150; g = 70; b = 80; }
    else { r += 14 * Math.sin(y / 7); g += 12 * Math.cos(x / 9); b += 10 * Math.sin((x + y) / 11); }
    data[i] = Math.max(0, Math.min(255, Math.round(r + 10 * n)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g + 10 * n)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b + 10 * n)));
  }
  return data;
}

const raw = (data: Buffer, width: number, height: number, channels: 3 | 4 = 3) => sharp(data, { raw: { width, height, channels } });

let face12mp: Buffer;        // 12 MP JPEG portrait
let huge: Buffer;            // 8 MB+ JPEG (incompressible grain)
let alphaPng: Buffer;        // PNG with a real alpha channel
let tiny: Buffer;            // 100 x 100 source
let animated: Buffer;        // two-frame animated GIF
let gradient: Buffer;        // smooth ramp, for banding
let smallWebp: Buffer;       // already inside the contract

before(async () => {
  face12mp = await raw(facePixels(4000, 3000), 4000, 3000).jpeg({ quality: 98, chromaSubsampling: '4:4:4' }).toBuffer();
  const noise = Buffer.alloc(4000 * 3000 * 3);
  const next = grain(4242);
  for (let i = 0; i < noise.length; i += 1) noise[i] = next();
  huge = await raw(noise, 4000, 3000).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
  alphaPng = await sharp({ create: { width: 900, height: 1400, channels: 4, background: { r: 240, g: 90, b: 120, alpha: 0.4 } } }).png().toBuffer();
  tiny = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#3366aa' } }).png().toBuffer();
  animated = await sharp([
    await sharp({ create: { width: 200, height: 200, channels: 3, background: '#ff0000' } }).png().toBuffer(),
    await sharp({ create: { width: 200, height: 200, channels: 3, background: '#0000ff' } }).png().toBuffer(),
  ], { join: { animated: true } }).gif().toBuffer();
  const ramp = Buffer.alloc(1024 * 1024 * 3);
  for (let y = 0; y < 1024; y += 1) for (let x = 0; x < 1024; x += 1) {
    const i = (y * 1024 + x) * 3, value = Math.round((x / 1023) * 255);
    ramp[i] = value; ramp[i + 1] = value; ramp[i + 2] = value;
  }
  gradient = await raw(ramp, 1024, 1024).png().toBuffer();
  smallWebp = await sharp({ create: { width: AVATAR_TARGET, height: AVATAR_TARGET, channels: 3, background: '#123456' } }).webp({ quality: 80 }).toBuffer();
});

after(() => { try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ } });

/* -------------------------------- crop maths ------------------------------- */

test('the crop starts fitted and centred, and zoom is limited to fit..4x', () => {
  const start = initialCrop(4000, 3000, 300);
  assert.equal(start.zoom, AVATAR_ZOOM_MIN);
  // Cover scale on a landscape photo is driven by the short edge.
  assert.equal(coverScale(4000, 3000, 300), 0.1);
  // Centred: equal slack on the left and the right of the 300px window.
  assert.equal(Math.round(start.pan.x), -50);
  assert.equal(Math.round(start.pan.y), 0);
  // At fit, the crop is the largest centred square of the source.
  const fitted = cropRect(start, 4000, 3000, 300);
  assert.equal(Math.round(fitted.size), 3000);
  assert.equal(Math.round(fitted.sx), 500);
  assert.equal(Math.round(fitted.sy), 0);
  assert.equal(clampZoom(0.2), AVATAR_ZOOM_MIN);
  assert.equal(clampZoom(99), AVATAR_ZOOM_MAX);
  assert.equal(clampZoom(Number.NaN), AVATAR_ZOOM_MIN);
  assert.equal(AVATAR_ZOOM_MAX, 4);
});

test('the crop can never leave the image, for any zoom, pan, drag or image shape', () => {
  const shapes: [number, number][] = [[4000, 3000], [3000, 4000], [512, 512], [100, 640], [1, 900], [4096, 17]];
  let seed = 991;
  const random = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) / 0xffffff; };
  for (const [width, height] of shapes) for (const viewport of [120, 288, 421]) {
    let state: CropState = initialCrop(width, height, viewport);
    for (let step = 0; step < 200; step += 1) {
      // Alternate violent drags and wheel/pinch zooms, including illegal values.
      state = panBy(state, { x: (random() - 0.5) * 6000, y: (random() - 0.5) * 6000 }, width, height, viewport);
      state = zoomAround(state, random() * 8 - 2, { x: random() * viewport, y: random() * viewport }, width, height, viewport);
      assert.ok(state.zoom >= AVATAR_ZOOM_MIN && state.zoom <= AVATAR_ZOOM_MAX, 'zoom stays inside fit..4x');
      const rect = cropRect(state, width, height, viewport);
      assert.ok(rect.sx >= -1e-6 && rect.sy >= -1e-6, 'crop never starts outside the image');
      assert.ok(rect.sx + rect.size <= width + 1e-6, 'crop never runs past the right edge');
      assert.ok(rect.sy + rect.size <= height + 1e-6, 'crop never runs past the bottom edge');
      assert.ok(rect.size > 0 && rect.size <= Math.min(width, height) + 1e-6, 'crop is a square inside the image');
    }
  }
});

test('zooming keeps the point under the cursor, and dragging moves the picture with it', () => {
  const [width, height, viewport] = [1600, 1200, 300];
  const start = initialCrop(width, height, viewport);
  const focus = { x: 220, y: 90 };
  const before = cropRect(start, width, height, viewport);
  const sourceUnderCursorX = before.sx + (focus.x / viewport) * before.size;
  const zoomed = zoomAround(start, 2.5, focus, width, height, viewport);
  const after = cropRect(zoomed, width, height, viewport);
  assert.ok(Math.abs((after.sx + (focus.x / viewport) * after.size) - sourceUnderCursorX) < 1, 'anchor pixel stays under the cursor');
  assert.ok(Math.abs(after.size * 2.5 - before.size) < 1, 'zoom 2.5x shows 2.5x fewer source pixels');
  // Arrow keys: moving the picture right shows a region further left.
  const nudged = panBy(zoomed, { x: 24, y: 0 }, width, height, viewport);
  assert.ok(cropRect(nudged, width, height, viewport).sx < after.sx);
  // Fully zoomed out there is nothing to pan on the short axis.
  const home = centrePan(width, height, viewport, AVATAR_ZOOM_MIN);
  assert.equal(clampPan({ x: 9999, y: 9999 }, width, height, viewport, AVATAR_ZOOM_MIN).y, home.y);
});

test('output size is capped at 512, floored at 128 and never upscales in between', () => {
  assert.equal(outputSize(4000), AVATAR_TARGET);
  assert.equal(outputSize(512), AVATAR_TARGET);
  assert.equal(outputSize(300), 300, 'a 300px crop is stored at 300px, not blown up to 512');
  assert.equal(outputSize(128), AVATAR_MIN);
  assert.equal(outputSize(100), AVATAR_MIN, 'a postage-stamp source still reaches the 128px floor');
  assert.equal(outputSize(0), AVATAR_MIN);
  assert.equal(outputSize(Number.NaN), AVATAR_MIN);
  assert.deepEqual(sizeLadder(4000), [512, 384, 256]);
  assert.deepEqual(sizeLadder(300), [300, 256]);
  assert.deepEqual(sizeLadder(100), [128]);
});

test('downscaling halves repeatedly and the quality ladder steps 0.9 to 0.5 by 0.05', () => {
  assert.deepEqual(halvingSteps(4000, 512), [2000, 1000, 512]);
  assert.deepEqual(halvingSteps(3000, 512), [1500, 750, 512]);
  assert.deepEqual(halvingSteps(512, 512), [512]);
  assert.deepEqual(halvingSteps(700, 512), [512]);
  assert.deepEqual(halvingSteps(100, 128), [128]);
  for (const steps of [halvingSteps(4000, 512), halvingSteps(9000, 256)]) {
    for (let i = 1; i < steps.length; i += 1) assert.ok(steps[i - 1] / steps[i] <= 2.0001, 'no step reduces by more than half');
  }
  assert.deepEqual(qualitySteps(), [0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5]);
});

test('the compression search drops quality first, then 384 and 256, and always answers', async () => {
  const tried: [number, number][] = [];
  // Only 256px at 0.5 fits: the search must exhaust the ladder in order.
  const found = await compressToBudget(async (edge, quality) => {
    tried.push([edge, quality]);
    return { result: edge + ':' + quality, size: edge === 256 && quality <= 0.5 ? 1000 : 900000 };
  }, 4000, AVATAR_CLIENT_MAX_BYTES);
  assert.equal(found.result, '256:0.5');
  assert.deepEqual(tried[0], [512, 0.9]);
  assert.deepEqual(tried[9], [384, 0.9], 'the 512 ladder is exhausted before dropping to 384');
  assert.equal(tried.length, 27);
  // First fit wins with no further attempts.
  const calls: number[] = [];
  const quick = await compressToBudget(async (edge, quality) => { calls.push(quality); return { result: 'ok', size: 1024 }; }, 512);
  assert.equal(quick.result, 'ok');
  assert.deepEqual(calls, [0.9]);
  // Nothing fits: the smallest attempt is returned rather than failing.
  const fallback = await compressToBudget(async (edge, quality) => ({ result: edge + ':' + quality, size: 400000 + edge * 100 + Math.round(quality * 1000) }), 512);
  assert.equal(fallback.result, '256:0.5', 'the smallest attempt seen is handed back');
  assert.ok(fallback.size > AVATAR_CLIENT_MAX_BYTES);
  // An encoder that never produces bytes is an error, not a silent empty file.
  await assert.rejects(() => compressToBudget(async () => null, 512), /could not be prepared/);
});

test('the real encoder ladder lands under the client budget for a 12 MP photo', async () => {
  // Stands in for canvas.toBlob: same ladder, same budget, real encoded bytes.
  const attempts: number[] = [];
  const crop = cropRect(initialCrop(4000, 3000, 300), 4000, 3000, 300);
  const chosen = await compressToBudget(async (edge, quality) => {
    const bytes = await sharp(face12mp)
      .extract({ left: Math.round(crop.sx), top: Math.round(crop.sy), width: Math.round(crop.size), height: Math.round(crop.size) })
      .resize(edge, edge).webp({ quality: Math.round(quality * 100) }).toBuffer();
    attempts.push(bytes.length);
    return { result: bytes, size: bytes.length };
  }, outputSize(crop.size));
  assert.ok(chosen.size <= AVATAR_CLIENT_MAX_BYTES, 'final size fits the 190 KB client budget');
  const meta = await sharp(chosen.result).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, AVATAR_TARGET);
  assert.equal(meta.height, AVATAR_TARGET);
  assert.ok(attempts.length >= 1);
});

/* ------------------------------ server safety net --------------------------- */

test('an 8 MB+ 12 MP photo is stored as a 512px WebP well under 200 KB', async () => {
  assert.ok(huge.length > 8 * 1024 * 1024, 'fixture really is over 8 MB: ' + huge.length);
  const out = await processAvatarImage(huge);
  assert.equal(out.mime, 'image/webp');
  assert.equal(out.width, AVATAR_TARGET);
  assert.equal(out.height, AVATAR_TARGET);
  assert.ok(out.reencoded);
  assert.ok(out.bytes.length <= AVATAR_MAX_BYTES, 'stored ' + out.bytes.length + ' bytes');
  assert.equal((await sharp(out.bytes).metadata()).format, 'webp');
});

test('a 12 MP portrait keeps clean facial detail and drops no metadata bomb', async () => {
  assert.ok(face12mp.length > 4 * 1024 * 1024);
  const out = await processAvatarImage(face12mp);
  assert.ok(out.bytes.length <= AVATAR_MAX_BYTES);
  assert.equal(out.quality, 80, 'q80 is enough; the ladder never has to degrade a normal photo');
  // Compare against a lossless 512px reference of the same centre crop: a
  // blurred or over-compressed face would blow this error up.
  const reference = await sharp(face12mp).rotate().resize(AVATAR_TARGET, AVATAR_TARGET, { fit: 'cover', position: 'centre' }).removeAlpha().raw().toBuffer();
  const produced = await sharp(out.bytes).removeAlpha().raw().toBuffer();
  assert.equal(produced.length, reference.length);
  let total = 0;
  for (let i = 0; i < reference.length; i += 1) total += Math.abs(reference[i] - produced[i]);
  assert.ok(total / reference.length < 6, 'mean absolute error per channel stays low: ' + (total / reference.length).toFixed(2));
  // Detail survives: the encoded image keeps most of the reference's edge energy.
  const edges = async (bytes: Buffer) => {
    const { data } = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (let i = 1; i < data.length; i += 1) sum += Math.abs(data[i] - data[i - 1]);
    return sum / data.length;
  };
  const [want, got] = [await edges(await sharp(reference, { raw: { width: AVATAR_TARGET, height: AVATAR_TARGET, channels: 3 } }).png().toBuffer()), await edges(out.bytes)];
  assert.ok(got > want * 0.6, 'edge energy retained: ' + got.toFixed(2) + ' of ' + want.toFixed(2));
});

test('a smooth gradient survives without visible banding', async () => {
  const out = await processAvatarImage(gradient);
  const { data, info } = await sharp(out.bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const levels = new Set<number>();
  const row = Math.floor(info.height / 2);
  for (let x = 0; x < info.width; x += 1) levels.add(data[(row * info.width + x) * info.channels]);
  assert.ok(levels.size > 100, 'a banded ramp would collapse to a handful of levels, saw ' + levels.size);
  // No step in the ramp jumps far enough to read as a contour line.
  let worst = 0;
  for (let x = 1; x < info.width; x += 1) worst = Math.max(worst, Math.abs(data[(row * info.width + x) * info.channels] - data[(row * info.width + x - 1) * info.channels]));
  assert.ok(worst <= 6, 'largest neighbouring step ' + worst);
});

test('PNG alpha, 100px sources and animated GIFs are all handled', async () => {
  const alpha = await processAvatarImage(alphaPng);
  assert.equal(alpha.width, AVATAR_TARGET);
  assert.equal(alpha.height, AVATAR_TARGET);
  assert.ok(alpha.bytes.length <= AVATAR_MAX_BYTES);
  assert.equal((await sharp(alpha.bytes).metadata()).hasAlpha, true, 'transparency is preserved, not blackened');

  const small = await processAvatarImage(tiny);
  assert.equal(small.mime, 'image/webp');
  assert.equal(small.width, 100, 'a 100px source is never enlarged by the server');
  assert.equal(small.height, 100);

  const frame = await processAvatarImage(animated);
  const meta = await sharp(frame.bytes).metadata();
  assert.ok(!meta.pages || meta.pages === 1, 'only the first frame is kept');
  const pixels = await sharp(frame.bytes).removeAlpha().raw().toBuffer();
  assert.ok(pixels[0] > 200 && pixels[1] < 40 && pixels[2] < 40, 'the stored frame is the red first frame, not the blue second one');
});

test('EXIF rotation is applied before cropping', async () => {
  const flat = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#00ff00' } })
    .composite([{ input: await sharp({ create: { width: 150, height: 300, channels: 3, background: '#ff0000' } }).png().toBuffer(), left: 0, top: 0 }])
    .jpeg({ quality: 95 }).toBuffer();
  const rotated = await sharp(flat).withMetadata({ orientation: 6 }).jpeg({ quality: 95 }).toBuffer();
  const sample = async (bytes: Buffer) => {
    const { data, info } = await sharp((await processAvatarImage(bytes)).bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => data[(y * info.width + x) * info.channels];
    return { top: at(info.width >> 1, 6), bottom: at(info.width >> 1, info.height - 7), left: at(6, info.height >> 1) };
  };
  const upright = await sample(flat);
  assert.ok(upright.left > 200, 'unrotated: red is on the left');
  const turned = await sample(rotated);
  assert.ok(turned.top > 200 && turned.bottom < 60, 'orientation 6 moves red to the top before the crop');
});

test('a small square WebP is stored untouched, and non-images are refused', async () => {
  const passthrough = await processAvatarImage(smallWebp);
  assert.equal(passthrough.reencoded, false);
  assert.equal(passthrough.bytes.length, smallWebp.length, 'already-compliant bytes are not re-compressed');
  assert.equal(passthrough.quality, null);
  assert.equal(avatarSourceType(smallWebp), 'image/webp');
  for (const bogus of [readFileSync('public/media/flowers.mp4'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), Buffer.alloc(64)]) {
    await assert.rejects(processAvatarImage(bogus), /photo/i);
  }
  // A JPEG renamed as a PNG by the browser is rejected: bytes decide, not labels.
  await assert.rejects(processAvatarUpload(face12mp, 'image/png', DEFAULT_MEDIA), /do not match/i);
});

test('the safety net keeps stepping quality down until an awkward photo fits', async () => {
  // A 512px field of pure grain cannot reach 200 KB at q80; the ladder must work.
  const next = grain(31337);
  const speckle = Buffer.alloc(AVATAR_TARGET * AVATAR_TARGET * 3);
  for (let i = 0; i < speckle.length; i += 1) speckle[i] = next();
  const source = await raw(speckle, AVATAR_TARGET, AVATAR_TARGET).png().toBuffer();
  const out = await processAvatarImage(source);
  assert.ok(out.bytes.length <= AVATAR_MAX_BYTES, 'stored ' + out.bytes.length + ' bytes');
  assert.ok((out.quality ?? 0) <= 80 && (out.quality ?? 0) >= 30);
  assert.equal(out.mime, 'image/webp');
});

/* ------------------------------ upload pipeline ---------------------------- */

test('migration 13 is additive, repeatable and registered after Phase 10', async () => {
  await ensureSchema();
  const pool = await getPool();
  const migration = DATABASE_MIGRATIONS.at(-1);
  assert.ok(migration);
  assert.equal(migration.version, 13);
  assert.equal(migration.statements, avatarUpgradeStatements);
  // Rows that predate the column keep working and default to plain media.
  await member('legacy');
  const key = crypto.randomUUID();
  await pool.query("INSERT INTO assets(key,owner_id,storage_owner,mime,size,created_at,blob_url,status) VALUES($1,'legacy','legacy','image/jpeg',100,1,'local','ready')", [key]);
  // The runner replays a version's statements whenever it is behind.
  for (let pass = 0; pass < 2; pass += 1) for (const sql of migration.statements) await pool.query(sql);
  const row = (await pool.query('SELECT mime,size,purpose FROM assets WHERE key=$1', [key])).rows[0];
  assert.deepEqual(row, { mime: 'image/jpeg', size: 100, purpose: 'media' });
  const claims = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='upload_claims' AND column_name='purpose'");
  assert.equal(claims.rows.length, 1);
});

async function member(id: string) {
  const pool = await getPool();
  await pool.query('INSERT INTO "user"(id,name,email,role,"emailVerified") VALUES($1,$1,$2,\'user\',true) ON CONFLICT (id) DO NOTHING', [id, id + '@avatar.test']);
  await pool.query("INSERT INTO profiles(id,username,name,bio,avatar,is_demo,created_at) VALUES($1,$1,$1,'','',0,1) ON CONFLICT (id) DO NOTHING", [id]);
}

test('the avatar upload path re-encodes whatever the browser sends and records it', async () => {
  await ensureSchema();
  const pool = await getPool();
  await member('cropper');
  const key = crypto.randomUUID();
  let stored: Buffer | undefined;
  const store: UploadStore = {
    async inspect() { return { url: 'source', size: face12mp.length }; },
    async read() { return face12mp; },
    async write(_key, media) { stored = media.bytes; return 'stored'; },
    async remove() { },
  };
  // The browser claims a plain photo upload; the purpose flag is the only hint.
  await reserveClaim(pool, key, 'cropper', JSON.stringify({ size: face12mp.length, type: 'image/jpeg', purpose: 'avatar' }));
  const done = await finishWithStore(pool, key, 'cropper', store);
  assert.equal(done.type, 'image/webp', 'avatars are always stored as WebP');
  assert.equal(done.aspect, 1);
  assert.ok(stored && stored.length <= AVATAR_MAX_BYTES, 'stored ' + stored?.length + ' bytes');
  const asset = (await pool.query('SELECT * FROM assets WHERE key=$1', [key])).rows[0];
  assert.equal(asset.purpose, 'avatar');
  assert.equal(asset.mime, 'image/webp');
  assert.equal(asset.width, AVATAR_TARGET);
  assert.equal(asset.height, AVATAR_TARGET);
  assert.equal(asset.source_mime, 'image/jpeg');
  assert.ok(Number(asset.size) <= AVATAR_MAX_BYTES);
  // The same key can still be attached even if WebP output were disallowed:
  // the media-type gate looks at the type the member actually chose.
  const restricted = { ...DEFAULT_MEDIA, allowedTypes: ['image/jpeg'], imageFormat: 'jpeg' as const };
  const [checked] = await checkAssets(pool, ['/api/media/' + key], ['cropper'], restricted);
  assert.equal(checked.key, key);
});

test('the avatar reservation refuses videos, oversize sources and changed intent', async () => {
  await ensureSchema();
  const pool = await getPool();
  await member('guard');
  await assert.rejects(reserveClaim(pool, crypto.randomUUID(), 'guard', JSON.stringify({ size: 1000, type: 'video/mp4', purpose: 'avatar' })), /photo/i);
  await assert.rejects(reserveClaim(pool, crypto.randomUUID(), 'guard', JSON.stringify({ size: AVATAR_SOURCE_MAX_BYTES + 1, type: 'image/jpeg', purpose: 'avatar' })), /too large/i);
  const key = crypto.randomUUID();
  await reserveClaim(pool, key, 'guard', JSON.stringify({ size: 1000, type: 'image/jpeg', purpose: 'avatar' }));
  await assert.rejects(reserveClaim(pool, key, 'guard', JSON.stringify({ size: 1000, type: 'image/jpeg' })), /start a new upload/i);
  assert.equal((await pool.query('SELECT purpose FROM upload_claims WHERE key=$1', [key])).rows[0].purpose, 'avatar');
  // A regular post upload is untouched by any of this.
  const plain = crypto.randomUUID();
  await reserveClaim(pool, plain, 'guard', JSON.stringify({ size: 1000, type: 'video/mp4' }));
  assert.equal((await pool.query('SELECT purpose FROM upload_claims WHERE key=$1', [plain])).rows[0].purpose, 'media');
});

test('only avatar-shaped assets may become a profile photo', () => {
  assert.equal(avatarAssetReady({ mime: 'image/webp', size: 40_000, purpose: 'avatar' }), true);
  assert.equal(avatarAssetReady({ mime: 'image/webp', size: 40_000, purpose: 'media' }), true, 'bytes already inside the contract are enough');
  assert.equal(avatarAssetReady({ mime: 'image/jpeg', size: 40_000, purpose: 'media' }), false, 'an arbitrary post photo is not an avatar');
  assert.equal(avatarAssetReady({ mime: 'image/webp', size: AVATAR_MAX_BYTES + 1, purpose: 'avatar' }), false);
  assert.equal(avatarAssetReady({ mime: 'video/mp4', size: 10, purpose: 'avatar' }), false);
  assert.equal(avatarAssetReady(null), false);
});

test('avatar bytes are served with immutable cache headers; other media is not', async () => {
  await ensureSchema();
  const pool = await getPool();
  await member('served');
  const write = async (key: string, bytes: Buffer, mime: string, purpose: string) => {
    await fs.mkdir('.local/uploads', { recursive: true });
    await fs.writeFile('.local/uploads/' + key, bytes);
    await pool.query("INSERT INTO assets(key,owner_id,storage_owner,mime,size,created_at,blob_url,purpose) VALUES($1,'served','served',$2,$3,$4,'local',$5)", [key, mime, bytes.length, Date.now(), purpose]);
  };
  const avatarKey = crypto.randomUUID(), photoKey = crypto.randomUUID();
  const avatarBytes = (await processAvatarImage(tiny)).bytes;
  await write(avatarKey, avatarBytes, 'image/webp', 'avatar');
  await write(photoKey, avatarBytes, 'image/webp', 'media');
  try {
    const call = (key: string) => mediaRoute(new Request('http://localhost/api/media/' + key), { params: Promise.resolve({ key }) });
    const served = await call(avatarKey);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('cache-control'), AVATAR_CACHE_CONTROL);
    assert.equal(served.headers.get('content-type'), 'image/webp');
    assert.equal((await served.arrayBuffer()).byteLength, avatarBytes.length);
    assert.equal((await call(photoKey)).headers.get('cache-control'), 'private, no-store', 'post media keeps its private headers');
  } finally {
    await fs.rm('.local/uploads/' + avatarKey, { force: true });
    await fs.rm('.local/uploads/' + photoKey, { force: true });
  }
});

/* -------------------------------- display ---------------------------------- */

test('every avatar renders a fixed, lazy, cover-fitted circle with no layout shift', () => {
  const person = { id: 'a', username: 'ada', name: 'Ada', avatar: '/api/media/' + crypto.randomUUID() };
  const html = renderToStaticMarkup(React.createElement(Avatar, { person, size: 40 }));
  assert.match(html, /width="40"/, 'intrinsic width attribute is present');
  assert.match(html, /height="40"/, 'intrinsic height attribute is present');
  assert.match(html, /loading="lazy"/);
  assert.match(html, /decoding="async"/);
  assert.match(html, /class="avatar-photo"/);
  assert.match(html, /width:40px/, 'the box is sized in CSS as well as in attributes');
  assert.match(html, /height:40px/);

  const eager = renderToStaticMarkup(React.createElement(Avatar, { person, size: 128, eager: true }));
  assert.match(eager, /loading="eager"/, 'above-the-fold avatars opt out of lazy loading');
  assert.match(eager, /fetchpriority="high"/i);

  // No photo: the muted placeholder keeps the same reserved box.
  const initials = renderToStaticMarkup(React.createElement(Avatar, { person: { ...person, avatar: '' }, size: 40 }));
  assert.ok(!initials.includes('<img'));
  assert.match(initials, /avatar-initial/);
  assert.match(initials, /width:40px/);
});

test('avatar CSS pins the circle so huge legacy images cannot overflow or shift', () => {
  const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');
  const rule = css.slice(css.indexOf('.avatar{'), css.indexOf('.avatar-initial{'));
  for (const declaration of ['aspect-ratio:1/1', 'border-radius:50%', 'object-fit:cover', 'object-position:center', 'background:var(--muted)', 'overflow:hidden']) {
    assert.ok(rule.includes(declaration), 'avatar rule declares ' + declaration);
  }
  assert.ok(css.includes('[data-slot=avatar-image]'), 'the shadcn avatar primitive gets the same contract');
  // Crop dialog: themed with the shared tokens, 44px targets, mobile sheet.
  assert.ok(css.includes('.avatar-crop-frame'), 'crop surface is styled');
  assert.ok(/\.avatar-crop-actions button\{min-height:44px\}/.test(css), 'crop buttons meet the 44px touch target');
  assert.ok(css.includes('var(--crop-scrim)') && css.includes('var(--crop-ring)'), 'the circle overlay uses theme tokens');
  assert.ok(css.includes('--crop-scrim:rgba(0,0,0,.58)'), 'the scrim has a dark-theme value');
  const admin = readFileSync(path.join(process.cwd(), 'app/rstmcadmin/admin-components.css'), 'utf8');
  assert.ok(admin.includes('.admin-shell .admin-avatar img'), 'admin table avatars are clipped to their circle too');
});
