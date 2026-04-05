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
    // v12: Switched from @codetrix-studio/capacitor-google-auth to @capacitor-firebase/authentication.
    // skipNativeAuth: true → plugin only handles the native picker + token retrieval.
    // We handle Firebase web SDK sign-in ourselves via signInWithCredential().
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ["google.com"]
    }
  }
};

export default config;
