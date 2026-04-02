import { CapacitorConfig } from '@capacitor/cli';

// ─────────────────────────────────────────────────────────────────────────────
// Identity cross-check (ALL values must match across all files):
//
//   Package name    : com.rewardhub.official.app
//     ✓ AndroidManifest.xml  → package attribute
//     ✓ android/app/build.gradle → applicationId
//     ✓ google-services.json → android_client_info.package_name
//     ✓ Firebase Console     → Android App package name
//
//   Web Client ID   : 563861371307-cg3bnlt6j34r88odgtn5t5816o6dlchc.apps.googleusercontent.com
//     ✓ GoogleAuth.serverClientId (below)
//     ✓ strings.xml → server_client_id
//     ✓ firebase.ts → WEB_CLIENT_ID
//     ✓ google-services.json → oauth_client client_type:3
//
//   AdMob App ID    : ca-app-pub-1560161047680443~4972275282
//     ✓ AdMob.appId (below)
//     ✓ AndroidManifest.xml → com.google.android.gms.ads.APPLICATION_ID
// ─────────────────────────────────────────────────────────────────────────────

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

    // ── Google Sign-In ──────────────────────────────────────────────────────
    // serverClientId MUST be the web client (client_type 3) from google-services.json.
    // This tells the Google SDK to return an id_token that Firebase can verify.
    GoogleAuth: {
      scopes:                  ['profile', 'email'],
      serverClientId:          '563861371307-cg3bnlt6j34r88odgtn5t5816o6dlchc.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },

    // ── AdMob ────────────────────────────────────────────────────────────────
    // appId is read by the @capacitor-community/admob plugin on initialization.
    // On Android, the App ID is also required in AndroidManifest.xml as a
    // meta-data tag — both are needed.
    //
    // isTesting: false → use real ads in production Codemagic builds.
    //   The admob.ts service also sets isTesting based on import.meta.env.PROD.
    AdMob: {
      appId:     'ca-app-pub-1560161047680443~4972275282',
      isTesting: false,
    },
  },
};

export default config;
