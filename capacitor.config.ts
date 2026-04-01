import { CapacitorConfig } from '@capacitor/cli';

// ─── Identity verification ────────────────────────────────────────────────
//
//  Package name      : com.rewardhub.official.app
//  Web Client ID     : 563861371307-cg3bnlt6j34r88odgtn5t5816o6dlchc.apps.googleusercontent.com
//    (client_type 3 in google-services.json — used as serverClientId for ID Token)
//
//  Both SHA-1 fingerprints are registered in Firebase Console (confirmed via
//  screenshot), so google-services.json now contains two client_type:1 entries. ✓
//
//  The `serverClientId` here MUST match the client_type:3 entry in
//  google-services.json so the plugin can request an ID Token back from Google.
// ─────────────────────────────────────────────────────────────────────────

const config: CapacitorConfig = {
  appId:   'com.rewardhub.official.app',
  appName: 'RewardHub',
  webDir:  'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor:    '#4F46E5',
      showSpinner:        false,
      androidScaleType:   'CENTER_INSIDE',
      splashFullScreen:   true,
      splashImmersive:    true,
    },
    GoogleAuth: {
      scopes:          ['profile', 'email'],
      // serverClientId MUST be the web client (type 3) from google-services.json
      // This is what tells Google to return an id_token Firebase Auth can verify
      serverClientId:  '563861371307-cg3bnlt6j34r88odgtn5t5816o6dlchc.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
