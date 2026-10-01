import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.functiongram.dypollabs',
  appName: 'FnGram',
  webDir: 'public',
  server: {
    url: 'https://functiongram.vercel.app',
    cleartext: false
  }
};

export default config;
