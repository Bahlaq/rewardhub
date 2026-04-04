import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rewardhub.official.app',
  appName: 'RewardHub',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#4F46E5",
      showSpinner: false,
      androidScaleType: "CENTER_INSIDE",
      splashFullScreen: true,
      splashImmersive: true,
    },
    GoogleAuth: {
      scopes: ["profile", "email"],
      serverClientId: "563861371307-cg3bnlt6j34r88odgtn5t5816o6dlchc.apps.googleusercontent.com",
      forceCodeForRefreshToken: true
      // Version 9.3.0: REMOVED redirectUri — it breaks native Android OAuth.
      // Native Google Sign-In uses intent-based auth, not redirect URIs.
      // The redirect URI is only needed for web popup auth (handled by Firebase SDK).
    }
  }
};

export default config;
