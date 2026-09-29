// Route directory must match this constant; changing paths requires a redeploy.
export const ADMIN_BASE_PATH = '/rstmcadmin';
export const ADMIN_BOOTSTRAP_ENV = 'ADMIN_BOOTSTRAP_EMAIL';
export const ADMIN_ROLES = ['admin', 'owner'] as const;
export type AdminRole = typeof ADMIN_ROLES[number];
export type AdminActor = { userId: string; email: string; role: AdminRole };

// Foundation registry only. Later phases wire these into the public app.
// No secrets, bootstrap state, role policy or audit-disable switch belongs here.
export const SETTINGS_DEFAULTS = {
  'appearance.config': '',
  'features.config': '',
  'labels.config': '',
  'media.config': '',
  'moderation.config': '',
  'content.reelMaxSeconds': 0,
  'content.storyHours': 24,
  'content.reelsEnabled': true,
  'content.reelCredit': '',
  'brand.name': 'RSTMC.',
  'brand.logoUrlLight': '',
  'theme.primary': '#eb456e',
  'theme.defaultTheme': 'system',
  'upload.maxFileMb': 20,
  'upload.dailyQuotaMb': 250,
};
export type Settings = typeof SETTINGS_DEFAULTS;
export type SettingKey = keyof Settings;
