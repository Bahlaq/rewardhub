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
      // v10: REMOVED forceCodeForRefreshToken — requests server auth code requiring
      //   a backend server to exchange. RewardHub has no backend, so this silently
      //   breaks the native Android auth flow by corrupting the token response.
      // v10: REMOVED redirectUri — native Android uses intent-based auth (startActivityForResult),
      //   not HTTP redirects. Setting a redirectUri forces the wrong OAuth flow.
    }
  }
};

export default config;
