/**
 * Local sticker pack.
 *
 * Stickers are static identifiers, not uploads: the whole pack ships with the
 * application, the client renders it, and the server only ever has to decide
 * whether an identifier is in the pack. That keeps the feature lightweight — no
 * sticker backend, no processing pipeline, no per-message asset — while still
 * being a real message type rather than text pretending to be one.
 *
 * The module is deliberately dependency-free and isomorphic: the same table
 * validates a send on the server and renders the picker in the browser, so the
 * two can never drift. It imports nothing at all, which is what lets a client
 * component render the pack without pulling the server's validation chain (and
 * its database and filesystem imports) into the browser bundle.
 */
export type Sticker = {
  /** Stable identifier persisted on the message (`messages.sticker_id`). */
  id: string;
  /** Accessible name; also the hover/alt text. */
  label: string;
  /** Single grapheme cluster used to render the sticker. */
  glyph: string;
  /** Background gradient, so a sticker reads as artwork and not as an emoji
   *  dropped into a text bubble. */
  from: string;
  to: string;
};

export const STICKER_PACK: readonly Sticker[] = [
  { id: 'wave', label: 'Wave', glyph: '👋', from: '#ffd28a', to: '#ff9d5c' },
  { id: 'heart', label: 'Love', glyph: '❤️', from: '#ffb3c7', to: '#ff5c8a' },
  { id: 'laugh', label: 'Laughing', glyph: '😂', from: '#ffe27a', to: '#ffb03a' },
  { id: 'thumbs-up', label: 'Thumbs up', glyph: '👍', from: '#a8e6ff', to: '#4aa8ff' },
  { id: 'clap', label: 'Applause', glyph: '👏', from: '#ffd6a5', to: '#ff8f6b' },
  { id: 'fire', label: 'Fire', glyph: '🔥', from: '#ffb75e', to: '#ed1c24' },
  { id: 'party', label: 'Celebration', glyph: '🎉', from: '#c3aed6', to: '#867ae9' },
  { id: 'cake', label: 'Cake', glyph: '🎂', from: '#fbc2eb', to: '#a6c1ee' },
  { id: 'coffee', label: 'Coffee', glyph: '☕', from: '#d6bfa1', to: '#8d6e63' },
  { id: 'pizza', label: 'Pizza', glyph: '🍕', from: '#ffe29a', to: '#ffa45c' },
  { id: 'sun', label: 'Sunny', glyph: '☀️', from: '#fff3a1', to: '#ffb44a' },
  { id: 'rain', label: 'Rain', glyph: '🌧️', from: '#bdc3c7', to: '#6f86d6' },
  { id: 'snow', label: 'Snow', glyph: '❄️', from: '#e0f7ff', to: '#8ecae6' },
  { id: 'rainbow', label: 'Rainbow', glyph: '🌈', from: '#a1c4fd', to: '#c2e9fb' },
  { id: 'rocket', label: 'Rocket', glyph: '🚀', from: '#89f7fe', to: '#66a6ff' },
  { id: 'star', label: 'Star', glyph: '⭐', from: '#fdfc47', to: '#24fe41' },
  { id: 'trophy', label: 'Trophy', glyph: '🏆', from: '#f7d774', to: '#e0a63c' },
  { id: 'camera', label: 'Photo', glyph: '📷', from: '#cfd9df', to: '#7f8c9b' },
  { id: 'music', label: 'Music', glyph: '🎵', from: '#a18cd1', to: '#fbc2eb' },
  { id: 'book', label: 'Reading', glyph: '📚', from: '#f6d365', to: '#fda085' },
  { id: 'sleep', label: 'Sleepy', glyph: '😴', from: '#c1d5f0', to: '#7f9cc9' },
  { id: 'think', label: 'Thinking', glyph: '🤔', from: '#ffe9a8', to: '#f5c26b' },
  { id: 'shock', label: 'Shocked', glyph: '😮', from: '#ffc3a0', to: '#ffafbd' },
  { id: 'cool', label: 'Cool', glyph: '😎', from: '#43cea2', to: '#185a9d' },
] as const;

const BY_ID = new Map<string, Sticker>(STICKER_PACK.map(sticker => [sticker.id, sticker]));

/** Resolve a persisted identifier, or `null` when it is not in the pack. */
export function stickerById(id: unknown): Sticker | null {
  if (typeof id !== 'string') return null;
  return BY_ID.get(id) ?? null;
}
