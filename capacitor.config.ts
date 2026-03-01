import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rewardhub.app',
  appName: 'RewardHub',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
