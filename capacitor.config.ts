import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rewardhub.official.app',
  appName: 'RewardHub',
  webDir: 'dist',

  // Note: `bundledWebRuntime` was REMOVED in Capacitor 3.x and is not a
  // valid key in Capacitor 6. Do not add it — it will be ignored at best
  // and rejected by the CLI at worst.

  // ---- iOS ---------------------------------------------------------
  ios: {
    contentInset: 'automatic',
    // Default scheme is `capacitor`. Keeping it explicit so the URL the
    // WebView loads is deterministic and matches what the plugins expect.
    scheme: 'RewardHub',
  },

  // ---- Android (untouched, listed for completeness) ----------------
  android: {
    allowMixedContent: false,
  },

  // ---- WebView server configuration --------------------------------
  // androidScheme 'https' is the Capacitor default and is required for
  // service workers / secure cookies. iOS uses `capacitor://` scheme
  // by default, which is fine — do NOT set server.url unless you want
  // the app to load from a remote origin.
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
    // Allow redirects to these hosts during in-app navigation (e.g.
    // Google Sign-In and Firebase Auth popups). Extend as needed.
    allowNavigation: [
      'accounts.google.com',
      '*.firebaseapp.com',
      '*.googleapis.com',
     
