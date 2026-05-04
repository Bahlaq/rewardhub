import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rewardhub.official.app',
  appName: 'RewardHub',
  webDir: 'www',

  ios: {
    contentInset: 'automatic',
    // CRITICAL: 'capacitor' (default) — NOT a custom scheme like 'RewardHub'.
    // WKWebView treats custom URL schemes as opaque origins, which makes
    // ALL same-origin script errors appear as opaque cross-origin
    // "Script error." with no filename or stack trace. The default
    // 'capacitor' scheme is recognized as a first-party origin and
    // surfaces real error details to window.onerror.
    scheme: 'capacitor',
  },

  android: {
    allowMixedContent: false,
  },

  server: {
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
