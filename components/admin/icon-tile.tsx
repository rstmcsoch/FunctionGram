/** Icon tile used by stat cards, section cards and empty states (§9.1, §9.10).
 *
 * VISUAL ONLY. Every icon here is decorative and marked aria-hidden (§11); the
 * meaning always stays in the adjacent text, which is never modified.
 */

import {
  Activity, Download, Flag, HardDrive, LayoutGrid, ServerCog, Users, UserPlus,
} from 'lucide-react';

const TILE_ICONS = { Users, UserPlus, Activity, LayoutGrid, Flag, HardDrive, Download, ServerCog } as const;

export type TileIcon = keyof typeof TILE_ICONS;
export type TileTone = 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'cyan';

export function IconTile({ icon, tone = 'blue', size = 40 }: { icon: TileIcon; tone?: TileTone; size?: 40 | 48 }) {
  const Glyph = TILE_ICONS[icon];
  return <span className="admin-icon-tile" data-tone={tone} data-size={size} aria-hidden="true">
    <Glyph size={size === 48 ? 22 : 20} strokeWidth={2} />
  </span>;
}
