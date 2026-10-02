import 'server-only';
import { readAppSettings } from './settings-cache';
import { appearanceFromSettings } from './appearance';
import { labelsFromSettings, createTranslator } from './admin/labels';
import { mediaConfig } from './media-config';
import { missingConfiguration } from './config';
import { requestMemo } from './request-context';

/**
 * Public, globally cacheable application configuration.
 *
 * The root layout and the page each need the appearance, the labels and the
 * media policy. They are derived from the same settings snapshot and are
 * identical for every visitor, so each is resolved once per request (and the
 * settings themselves once per cache window) instead of once per call site.
 */
export async function publicAppearance() {
  return requestMemo('appearance', async () => {
    if (missingConfiguration().length) return (await import('./appearance')).DEFAULT_APPEARANCE;
    try { return appearanceFromSettings(await readAppSettings()); }
    catch { return (await import('./appearance')).DEFAULT_APPEARANCE; }
  });
}

export async function getLabels() {
  return requestMemo('labels', async () => {
    if (missingConfiguration().length) return {};
    try { return labelsFromSettings(await readAppSettings()); }
    catch { return {}; }
  });
}

export async function getTranslator() {
  return createTranslator(await getLabels());
}

export async function publicMedia() {
  return requestMemo('media-policy', async () => {
    const fallback = (await import('./media-config')).DEFAULT_MEDIA;
    if (missingConfiguration().length) return fallback;
    try { return mediaConfig(await readAppSettings()); }
    catch { return { ...fallback, enabled: false }; }
  });
}
