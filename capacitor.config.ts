import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rewardhub.official.app',
  appName: 'RewardHub',
  webDir: 'dist',

  // iOS platform settings
  ios: {
    contentInset: 'automatic',
    // Uncomment the next line only if you also want to override in native code:
    // scheme: 'RewardHub',
  },

  // Android platform settings — untouched, shown here for completeness.
  android: {
    allowMixedContent: false,
  },

  plugins: {
    // ------------------------------------------------------------------
    // Google Sign-In (@codetrix-studio/capacitor-google-auth)
    // ------------------------------------------------------------------
    // serverClientId must be the WEB client ID (not the iOS one),
    // because the plugin exchanges the iOS ID token for a server-side
    // token verified against this client.
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId:
        '563861371307-8emfj8kd3725lpj0mb9kkkf1r16100hu.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },

    // ------------------------------------------------------------------
    // Push Notifications (@capacitor/push-notifications)
    // ------------------------------------------------------------------
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
