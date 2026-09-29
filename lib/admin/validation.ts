import { SETTINGS_DEFAULTS, type SettingKey, type Settings } from './config';

export class AdminError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function validateSetting(key: string, value: unknown): Settings[SettingKey] {
  if (!Object.hasOwn(SETTINGS_DEFAULTS, key)) throw new AdminError('Unknown setting.');
  let valid = false;
  switch (key as SettingKey) {
    case 'content.reelMaxSeconds': valid = typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 600; break;
    case 'content.storyHours': valid = typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 168; break;
    case 'content.reelsEnabled': valid = typeof value === 'boolean'; break;
    case 'content.reelCredit': valid = typeof value === 'string' && value.length <= 100; break;
    case 'brand.name': valid = typeof value === 'string' && value.trim().length > 0 && value.length <= 80 && !/[\x00-\x1f]/.test(value); break;
    case 'brand.logoUrlLight': {
      if (typeof value !== 'string' || value.length > 2048) break;
      if (value === '') { valid = true; break; }
      try {
        const url = new URL(value);
        valid = url.protocol === 'https:' && !url.username && !url.password;
      } catch { valid = /^\/(?!\/)[a-zA-Z0-9/_-]+(?:\.[a-zA-Z0-9]+)?$/.test(value); }
      break;
    }
    case 'theme.primary': valid = typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value); break;
    case 'theme.defaultTheme': valid = ['system', 'light', 'dark'].includes(value as string); break;
    case 'upload.maxFileMb': valid = typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100; break;
    case 'upload.dailyQuotaMb': valid = typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10000; break;
  }
  if (!valid) throw new AdminError('Invalid setting value.');
  return value as Settings[SettingKey];
}
