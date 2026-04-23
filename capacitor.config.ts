import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rewardhub.official.app',
  appName: 'RewardHub',

  // ------------------------------------------------------------------
  // webDir MUST match vite.config.ts `build.outDir`, and both MUST be
  // `www` for Ionic Appflow's iOS pipeline to pass its pre-build
  // sanity check ("[!] No www found in root of project").
  // ------------------------------------------------------------------
  webDir: 'www',

  ios: {
    contentInset: 'automatic',
    scheme: 'RewardHub',
  },

  android: {
    allowMixedContent: false,
  },

  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
    allowNavigation: [
      'accounts.google.com',
      '*.firebaseapp.com',
      '*.googleapis.com',
      '*.gstatic.com',
    ],
  },

  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId:
        '563861371307-8emfj8kd3725lpj0mb9kkkf1r16100hu.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
