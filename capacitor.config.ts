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
      forceCodeForRefreshToken: true,
      // @ts-ignore
      redirectUri: "https://rewardhub-1ea27.firebaseapp.com/__/auth/handler"
    }
  }
};

export default config;
