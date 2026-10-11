import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zeeshan.app',
  appName: 'DukanDesk',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
