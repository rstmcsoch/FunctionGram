/**
 * Optional one-off: recompress stored profile photos that are over the 200 KB
 * avatar budget (or were never squared), without touching a single existing
 * byte.
 *
 * Dry run is the default. Nothing is ever deleted: each oversized avatar gets
 * a *new* asset key holding the 512px WebP, and only `profiles.avatar` is
 * repointed at it. The original asset row and its stored bytes stay exactly
 * where they are, so the old URL keeps working and an administrator can review
 * or trash it later from Admin -> Media.
 *
 *   npx tsx scripts/recompress-avatars.mts              # dry run, changes nothing
 *   npx tsx scripts/recompress-avatars.mts --apply      # write the new avatars
 *   npx tsx scripts/recompress-avatars.mts --apply --limit 50
 *
 * Requires DATABASE_URL/POSTGRES_URL (and BLOB_READ_WRITE_TOKEN unless the
 * local preview database is in use).
 */
import { put } from '@vercel/blob';
import { promises as fs } from 'node:fs';
import { getPool, localDevDatabase, ensureSchema } from '../lib/postgres';
import { localAssetPath } from '../lib/media-storage';
import { processAvatarImage } from '../lib/avatar-image';
import { AVATAR_MAX_BYTES } from '../lib/avatar';

const apply = process.argv.includes('--apply');
const limitFlag = process.argv.indexOf('--limit');
const limit = limitFlag > -1 ? Math.max(1, Math.min(5000, Number(process.argv[limitFlag + 1]) || 0)) || 500 : 500;

type Row = {
  key: string; owner_id: string | null; mime: string; size: number;
  blob_url: string; width: number | null; height: number | null; purpose: string;
  profile_id: string; username: string;
};

const kb = (bytes: number) => (bytes / 1024).toFixed(1) + ' KB';

async function readBytes(row: Row): Promise<Buffer> {
  if (localDevDatabase()) return fs.readFile(localAssetPath(row.key, row.blob_url));
  const url = new URL(row.blob_url);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.blob.vercel-storage.com')) throw new Error('Untrusted media host: ' + url.hostname);
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Could not download ' + row.key + ' (HTTP ' + response.status + ')');
  return Buffer.from(await response.arrayBuffer());
}

async function writeBytes(key: string, bytes: Buffer): Promise<string> {
  if (localDevDatabase()) {
    const url = 'local-processed:' + key + '-' + Date.now();
    await fs.mkdir('.local/uploads', { recursive: true });
    await fs.writeFile(localAssetPath(key, url), bytes, { flag: 'wx' });
    return url;
  }
  return (await put('processed/' + key, bytes, { access: 'public', contentType: 'image/webp', addRandomSuffix: false, allowOverwrite: false })).url;
}

await ensureSchema();
const pool = await getPool();

// Only photos that are actually attached to a profile, and only the ones that
// miss the contract: too large, not WebP, or never run through the pipeline.
const { rows } = await pool.query(
  `SELECT a.key,a.owner_id,a.mime,a.size,a.blob_url,a.width,a.height,a.purpose,p.id profile_id,p.username
     FROM profiles p
     JOIN assets a ON '/api/media/'||a.key = p.avatar
    WHERE p.deleted_at IS NULL AND a.status='ready' AND a.verified=true
      AND a.mime LIKE 'image/%'
      AND (a.size > $1 OR a.mime <> 'image/webp' OR a.purpose <> 'avatar')
    ORDER BY a.size DESC
    LIMIT $2`,
  [AVATAR_MAX_BYTES, limit],
);

const candidates = rows as unknown as Row[];
console.log((apply ? 'APPLY' : 'DRY RUN') + ': ' + candidates.length + ' profile photo(s) over the ' + kb(AVATAR_MAX_BYTES) + ' budget or not stored as WebP.');
if (!candidates.length) process.exit(0);

let converted = 0, savedBytes = 0, failures = 0;
for (const row of candidates) {
  const label = '@' + row.username + '  ' + row.key + '  ' + row.mime + '  ' + kb(Number(row.size));
  try {
    const bytes = await readBytes(row);
    const avatar = await processAvatarImage(bytes);
    savedBytes += Math.max(0, bytes.length - avatar.bytes.length);
    if (!apply) {
      console.log('  would rewrite  ' + label + '  ->  image/webp ' + kb(avatar.bytes.length) + ' (' + avatar.width + 'x' + avatar.height + ', q' + (avatar.quality ?? 'source') + ')');
      converted += 1;
      continue;
    }
    // A brand-new key: the bytes behind an avatar URL must never change,
    // because avatar URLs are served with immutable cache headers.
    const key = crypto.randomUUID();
    const url = await writeBytes(key, avatar.bytes);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO assets(key,owner_id,storage_owner,mime,size,created_at,blob_url,width,height,source_size,source_mime,purpose)
         VALUES($1,$2,$2,'image/webp',$3,$4,$5,$6,$7,$8,$9,'avatar')`,
        [key, row.owner_id, avatar.bytes.length, Date.now(), url, avatar.width, avatar.height, Number(row.size), row.mime],
      );
      // Guarded update: if the member changed their photo while this ran, leave it alone.
      const updated = await client.query('UPDATE profiles SET avatar=$1 WHERE id=$2 AND avatar=$3', ['/api/media/' + key, row.profile_id, '/api/media/' + row.key]);
      if (!updated.rowCount) throw new Error('profile photo changed during the run');
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    converted += 1;
    console.log('  rewrote        ' + label + '  ->  ' + key + '  image/webp ' + kb(avatar.bytes.length) + ' (' + avatar.width + 'x' + avatar.height + ')');
  } catch (error) {
    failures += 1;
    console.warn('  skipped        ' + label + '  ' + (error instanceof Error ? error.message : String(error)));
  }
}

console.log((apply ? 'Rewrote ' : 'Would rewrite ') + converted + ' avatar(s), about ' + kb(savedBytes) + ' smaller in total. ' + failures + ' skipped. No original bytes were deleted.');
if (!apply) console.log('Re-run with --apply to write the new avatars.');
