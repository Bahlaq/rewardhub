import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rewardhub.official.app',
  appName: 'RewardHub',
  webDir: 'www',

  ios: {
    contentInset: 'automatic',
    // Single scheme setting — do NOT also set server.iosScheme.
    // Having both causes a conflict; ios.scheme is the authoritative one.
    scheme: 'RewardHub',
  },

  android: {
    allowMixedContent: false,
  },

  server: {
    // iosScheme intentionally removed — ios.scheme above is the sole setting.
    androidScheme: 'https',
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
      // MUST be the WEB OAuth client ID (not the iOS client ID).
      // The web client ID is what produces a valid idToken for Firebase.
      serverClientId:
        '563861371307-cg3bnlt6j34r88odgtn5t5816o6dlchc.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
