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
      serverClientId: "563861371307-cg3bnlt6j34r88odgtn5t5816o6dlchc.apps.googleusercontent.com"
      // REMOVED forceCodeForRefreshToken — it requests a server authorization code
      //   that requires a backend to exchange. RewardHub has no backend.
      // REMOVED redirectUri — native Android uses intent-based auth, not HTTP redirects.
    }
  }
};

export default config;
