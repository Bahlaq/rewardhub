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
    // v12.1: Reverted to EXACT config that showed the native picker.
    // forceCodeForRefreshToken:true + grantOfflineAccess:true are what
    // made the picker appear. The token exchange is now handled differently
    // in firebase.ts (using accessToken instead of idToken).
GoogleAuth: {
  scopes: ['profile', 'email'],
  serverClientId: '563861371307-8emfj8kd3725lpj0mb9kkkf1r16100hu.apps.googleusercontent.com',
  forceCodeForRefreshToken: true,
},
  }
};

export default config;
