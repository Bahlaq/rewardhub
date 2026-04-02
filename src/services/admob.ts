/**
 * src/services/admob.ts
 *
 * Real AdMob integration using @capacitor-community/admob.
 *
 * ─── Ad Unit IDs (from AdMob Console) ────────────────────────────────────────
 *   App Open   : ca-app-pub-1560161047680443/4621280288
 *   Banner     : ca-app-pub-1560161047680443/4441792243
 *   Rewarded   : ca-app-pub-1560161047680443/9158932303
 *   AdMob App  : ca-app-pub-1560161047680443~4972275282  (AndroidManifest.xml)
 *
 * ─── Test vs Production ───────────────────────────────────────────────────────
 *   Development (npm run dev) → isTesting = true  → Google test ads
 *   Codemagic build          → isTesting = false → Real ads
 *   import.meta.env.PROD is set by Vite: false in dev, true in production build.
 *
 * ─── Google Test Ad Unit IDs ─────────────────────────────────────────────────
 *   These are Google's official test IDs — safe to use during development
 *   without risking invalid traffic flags on your real ad units.
 *   Rewarded : ca-app-pub-3940256099942544/5224354917
 *   Banner   : ca-app-pub-3940256099942544/6300978111
 */

import { Capacitor } from '@capacitor/core';

// ─── Is this a production Codemagic build? ─────────────────────────────────
// Vite sets import.meta.env.PROD = true for `vite build` (Codemagic always runs this).
// It is false for `vite --port=3000` (local dev).
const IS_PRODUCTION: boolean = import.meta.env.PROD === true;

// ─── Ad Unit IDs ──────────────────────────────────────────────────────────────
// Production IDs come from VITE_ADMOB_* env vars set in Codemagic.
// Hardcoded fallbacks are used if the env var is somehow missing.
const IDS = {
  rewarded:  IS_PRODUCTION
    ? (import.meta.env.VITE_ADMOB_REWARDED_ID  as string || 'ca-app-pub-1560161047680443/9158932303')
    : 'ca-app-pub-3940256099942544/5224354917',

  banner:    IS_PRODUCTION
    ? (import.meta.env.VITE_ADMOB_BANNER_ID    as string || 'ca-app-pub-1560161047680443/4441792243')
    : 'ca-app-pub-3940256099942544/6300978111',

  appOpen:   IS_PRODUCTION
    ? (import.meta.env.VITE_ADMOB_APP_OPEN_ID  as string || 'ca-app-pub-1560161047680443/4621280288')
    : 'ca-app-pub-3940256099942544/9257395921',
};

// ─── Module-level state ───────────────────────────────────────────────────────
let initialized  = false;
let bannerActive = false;

// ─── Helper: dynamic import with fallback ─────────────────────────────────────
// Dynamic import prevents the app from crashing if the plugin is not yet
// installed (e.g. during web development before `npm install` completes).
async function getAdMob() {
  try {
    return await import('@capacitor-community/admob');
  } catch {
    console.error(
      '[AdMob] @capacitor-community/admob not found. ' +
      'Run: npm install @capacitor-community/admob'
    );
    return null;
  }
}

// ─── AdMob Service ────────────────────────────────────────────────────────────
export const admobService = {

  /**
   * Must be called once after the user is authenticated.
   * Safe to call multiple times — only initializes once.
   */
  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform() || initialized) return;

    const mod = await getAdMob();
    if (!mod) return;

    try {
      await mod.AdMob.initialize({
        requestTrackingAuthorization: false, // iOS only
        initializeForTesting:          !IS_PRODUCTION,
      });
      initialized = true;
      console.log('[AdMob] Initialized —', IS_PRODUCTION ? 'PRODUCTION (real ads)' : 'TEST (simulated ads)');
    } catch (err) {
      console.error('[AdMob] initialize() failed:', err);
    }
  },

  // ── Rewarded Ad ─────────────────────────────────────────────────────────────

  /**
   * Prepares and shows a full-screen rewarded ad.
   *
   * On Android: Native AdMob SDK shows the real ad fullscreen.
   * On Web:     A 5-second simulated delay is used for development.
   *
   * @param onRewarded  Called when the user COMPLETES watching the ad and earns the reward.
   *                    This is where you call firebaseService.recordAdWatch().
   * @param onError     Called if the ad fails to load or display.
   */
  async showRewardedAd(
    onRewarded: () => Promise<void>,
    onError:    (message: string) => void
  ): Promise<void> {

    // ── Web fallback (development only) ───────────────────────────────────────
    if (!Capacitor.isNativePlatform()) {
      console.log('[AdMob] Web mode — simulating 5s rewarded ad');
      await new Promise<void>(resolve => setTimeout(resolve, 5000));
      await onRewarded();
      return;
    }

    if (!initialized) await this.initialize();

    const mod = await getAdMob();
    if (!mod) {
      onError('AdMob plugin not installed. Run: npm install @capacitor-community/admob');
      return;
    }

    const { AdMob, RewardAdPluginEvents } = mod;
    const listenerHandles: { remove: () => void }[] = [];
    let rewardReceived = false;

    const cleanup = () => {
      listenerHandles.forEach(h => { try { h.remove(); } catch (_) {} });
      listenerHandles.length = 0;
    };

    try {
      // ── Step 1: Register listeners BEFORE preparing the ad ─────────────────
      // Order matters: listeners must be in place before the SDK fires events.

      listenerHandles.push(
        await AdMob.addListener(RewardAdPluginEvents.Rewarded, async () => {
          // User watched enough to earn the reward.
          // Call the Firestore write here — the ad is still on screen.
          rewardReceived = true;
          try {
            await onRewarded();
          } catch (err) {
            console.error('[AdMob] onRewarded callback error:', err);
          }
        })
      );

      listenerHandles.push(
        await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
          // Ad was closed (either after reward or user dismissed early).
          cleanup();
          if (!rewardReceived) {
            console.log('[AdMob] Ad dismissed before reward — no points awarded.');
          }
        })
      );

      listenerHandles.push(
        await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (err: any) => {
          cleanup();
          const msg =
            err?.message ??
            (err?.code === 3 ? 'No ad available. Try again later.' : 'Ad failed to load.');
          console.error('[AdMob] FailedToLoad:', err);
          onError(msg);
        })
      );

      listenerHandles.push(
        await AdMob.addListener(RewardAdPluginEvents.FailedToShow, (err: any) => {
          cleanup();
          const msg = err?.message ?? 'Ad could not be displayed. Try again.';
          console.error('[AdMob] FailedToShow:', err);
          onError(msg);
        })
      );

      // ── Step 2: Prepare the ad (loads from network) ────────────────────────
      await AdMob.prepareRewardVideoAd({
        adId:      IDS.rewarded,
        isTesting: !IS_PRODUCTION,
      });

      // ── Step 3: Show the ad (fullscreen native overlay) ───────────────────
      await AdMob.showRewardVideoAd();

    } catch (err: any) {
      cleanup();
      const msg = err?.message ?? 'Unexpected AdMob error. Check your internet connection.';
      console.error('[AdMob] showRewardedAd caught error:', msg);
      onError(msg);
    }
  },

  // ── Banner Ad ───────────────────────────────────────────────────────────────

  /**
   * Shows a banner at the bottom of the screen.
   * The AdMob native banner overlays on top of the WebView.
   * margin=60 keeps it above the Navbar (approx 60px tall).
   * Only runs on native — the web placeholder div is shown instead on web.
   */
  async showBanner(): Promise<void> {
    if (!Capacitor.isNativePlatform() || bannerActive) return;
    if (!initialized) await this.initialize();

    const mod = await getAdMob();
    if (!mod) return;

    try {
      const { AdMob, BannerAdPosition, BannerAdSize } = mod;
      await AdMob.showBanner({
        adId:      IDS.banner,
        adSize:    BannerAdSize.ADAPTIVE_BANNER,
        position:  BannerAdPosition.BOTTOM_CENTER,
        margin:    60,            // pixels above bottom edge — clears the navbar
        isTesting: !IS_PRODUCTION,
      });
      bannerActive = true;
      console.log('[AdMob] Banner shown');
    } catch (err) {
      console.error('[AdMob] showBanner() failed:', err);
    }
  },

  async hideBanner(): Promise<void> {
    if (!Capacitor.isNativePlatform() || !bannerActive) return;
    const mod = await getAdMob();
    if (!mod) return;
    try {
      await mod.AdMob.hideBanner();
    } catch (err) {
      console.error('[AdMob] hideBanner() failed:', err);
    }
  },

  async removeBanner(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const mod = await getAdMob();
    if (!mod) return;
    try {
      await mod.AdMob.removeBanner();
      bannerActive = false;
      console.log('[AdMob] Banner removed');
    } catch (err) {
      console.error('[AdMob] removeBanner() failed:', err);
    }
  },

  get isBannerActive() { return bannerActive; },
  get isInitialized()  { return initialized;  },
};
