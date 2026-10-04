import {validateModeration} from '../moderation-policy';
import {validateMedia} from '../media-config';
import {validateLabels,MAX_LABEL_BYTES} from './labels';
import { validateFeatures } from '../features';
import { validateAppearance } from '../appearance';
import { SETTINGS_DEFAULTS, type SettingKey, type Settings } from './config';

export class AdminError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function validateSetting(key: string, value: unknown): Settings[SettingKey] {
  if (!Object.hasOwn(SETTINGS_DEFAULTS, key)) throw new AdminError('Unknown setting.');
  let valid = false;
  switch (key as SettingKey) {
    case 'moderation.config': {
      if(typeof value!=='string'||value.length>32000)throw new AdminError('Invalid moderation configuration.');
      if(value==='')return '';
      try{return JSON.stringify(validateModeration(JSON.parse(value)));}catch(error){throw new AdminError(error instanceof Error?error.message:'Invalid moderation settings.');}
    }
    case 'media.config': {
      if(typeof value!=='string'||value.length>4096)throw new AdminError('Invalid media configuration.');
      if(value==='')return '';
      try{return JSON.stringify(validateMedia(JSON.parse(value)));}catch(error){throw new AdminError(error instanceof Error?error.message:'Invalid media configuration.');}
    }
    case 'labels.config': {
      if(typeof value!=='string'||new TextEncoder().encode(value).length>MAX_LABEL_BYTES)throw new AdminError('Invalid label configuration.');
      if(value==='')return '';
      try{return JSON.stringify(validateLabels(JSON.parse(value)));}catch(error){throw new AdminError(error instanceof Error?error.message:'Invalid labels.');}
    }
    case 'features.config': {
      if(typeof value!=='string'||value.length>8000)throw new AdminError('Invalid features configuration.');
      if(value==='')return '';
      try{return JSON.stringify(validateFeatures(JSON.parse(value)));}catch(error){throw new AdminError(error instanceof Error?error.message:'Invalid configuration.');}
    }
    case 'appearance.config': {
      if(typeof value!=='string'||value.length>12000)throw new AdminError('Invalid appearance configuration.');
      if(value==='')return '';
      try{return JSON.stringify(validateAppearance(JSON.parse(value)));}catch(error){throw new AdminError(error instanceof Error?error.message:'Invalid appearance configuration.');}
    }
    case 'content.reelMaxSeconds': valid = typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 600; break;
    case 'content.storyHours': valid = typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 168; break;
    case 'content.reelsEnabled': valid = typeof value === 'boolean'; break;
    case 'content.storiesEnabled': valid = typeof value === 'boolean'; break;
    case 'content.storyPhotoSeconds': valid = typeof value === 'number' && Number.isInteger(value) && value >= 3 && value <= 15; break;
    case 'content.storyVideoMaxSeconds': valid = typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 15; break;
    case 'content.storyTrayEnabled': valid = typeof value === 'boolean'; break;
    case 'content.storyRingEnabled': valid = typeof value === 'boolean'; break;
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
    case 'messages.maxLength': valid = typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4000; break;
    case 'messages.rateWindowSeconds': valid = typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 86400; break;
    case 'messages.rateMaxMessages': valid = typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1000; break;
    case 'messages.privateFollowersOnly': valid = typeof value === 'boolean'; break;
  }
  if (!valid) throw new AdminError('Invalid setting value.');
  return value as Settings[SettingKey];
}
