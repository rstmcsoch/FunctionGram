/**
 * Server-side sticker validation.
 *
 * The pack itself lives in `sticker-pack.ts` so the browser can render exactly
 * the identifiers this validator accepts. What stays here is the part that needs
 * `AdminError`: refusing an identifier that is not in the pack.
 */
import { AdminError } from './admin/validation';
import { stickerById } from './sticker-pack';

export { STICKER_PACK, stickerById, type Sticker } from './sticker-pack';

/**
 * Validate a sticker identifier on the send path.
 *
 * The identifier is the only client-supplied part of a sticker message, so this
 * is the whole authorization surface: anything outside the pack is rejected
 * rather than stored, which means a message row can never carry an arbitrary
 * string that the renderer would later have to interpret.
 */
export function requireStickerId(value: unknown): string {
  const sticker = stickerById(value);
  if (!sticker) throw new AdminError('Choose a sticker from the pack.', 422);
  return sticker.id;
}
