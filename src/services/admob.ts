/**
 * src/services/admob.ts
 *
 * Real AdMob integration.
 *
 * Ad Unit IDs (production — from AdMob Console):
 *   App Open : ca-app-pub-1560161047680443/4621280288
 *   Banner   : ca-app-pub-1560161047680443/4441792243
 *   Rewarded : ca-app-pub-1560161047680443/9158932303
 *
 * Vite sets import.meta.env.PROD = true for `vite build` (Codemagic builds).
 * It is false for local `vite dev`, so test ads are used automatically.
 */

import { Capacitor } from '@capacitor/core';

const IS_PROD: boolean = import.meta.env.PROD === true;

const AD_IDS = {
  rewarded: IS_PROD
    ? (import.meta.env.VITE_ADMOB_REWARDED_ID as string || 'ca-app-pub-1560161047680443/9158932303')
    : 'ca-app-pub-3940256099942544/5224354917',   // Google official test ID

  banner: IS_PROD
    ? (import.meta.env.VITE_ADMOB_BANNER_ID as string || 'ca-app-pub-1560161047680443/4441792243')
    : 'ca-app-pub-3940256099942544/6300978111',

  appOpen: IS_PROD
    ? (import.meta.env.VITE_ADMOB_APP_OPEN_ID as string || 'ca-app-pub-1560161047680443/4621280288')
    : 'ca-app-pub-3940256099942544/9257395921',
};

let initialized  = false;
let bannerActive = false;

/** Dynamic import with null-fallback so the app never crashes if plugin missing. */
async function getAdMob() {
  try {
    return await import('@capacitor-community/admob');
  } catch {
    console.warn('[AdMob] Plugin not found. Run: npm install @capacitor-community/admob && npx cap sync android');
    return null;
  }
}

export interface RewardedAdCallbacks {
  /** Called when the native ad overlay finishes loading and is about to appear. */
  onLoaded?:   () => void;
  /**
   * Called when the user has watched enough to earn the reward.
   * At this point the native ad overlay is still visible.
   * Use this to write to Firestore.
   */
  onRewarded:  () => Promise<void>;
  /**
   * Called when the native ad overlay closes and the user is back in the app.
   * Use this to show the "Claim" button in your UI.
   */
  onDismissed: () => void;
  /** Called if the ad fails to load or show. */
  onError:     (message: string) => void;
}

export const admobService = {

  // ── Initialize ────────────────────────────────────────────────────────────
  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform() || initialized) return;
    const mod = await getAdMob();
    if (!mod) return;
    try {
      await mod.AdMob.initialize({
        requestTrackingAuthorization: false,  // iOS only
        initializeForTesting:          !IS_PROD,
      });
      initialized = true;
      console.log('[AdMob] Initialized —', IS_PROD ? 'PRODUCTION' : 'TEST');
    } catch (err) {
      console.error('[AdMob] initialize() failed:', err);
    }
  },

  // ── Rewarded Ad ───────────────────────────────────────────────────────────
  /**
   * Loads and shows a rewarded fullscreen ad.
   *
   * Native (Android APK):
   *   1. Loads ad from network
   *   2. Shows native fullscreen overlay (this is the "Ad Page")
   *   3. Fires onLoaded → onRewarded → onDismissed via SDK events
   *
   * Web (dev / browser):
   *   Simulates a 5-second countdown then fires the same callbacks in order.
   *   The caller's modal handles showing the countdown UI.
   */
  async showRewardedAd(callbacks: RewardedAdCallbacks): Promise<void> {
    const { onLoaded, onRewarded, onDismissed, onError } = callbacks;

    // ── Web fallback ─────────────────────────────────────────────────────────
    // Fires callbacks in the same order as the native SDK so the modal
    // state machine works identically in the browser.
    if (!Capacitor.isNativePlatform()) {
      console.log('[AdMob] Web mode — 5-second simulated rewarded ad');
      onLoaded?.();
      await new Promise<void>(r => setTimeout(r, 5000));
      try { await onRewarded(); } catch (e) { console.error('[AdMob] onRewarded error:', e); }
      onDismissed();
      return;
    }

    if (!initialized) await this.initialize();
    const mod = await getAdMob();
    if (!mod) {
      onError('AdMob plugin not installed. Run: npm install @capacitor-community/admob && npx cap sync android');
      return;
    }

    const { AdMob, RewardAdPluginEvents } = mod;
    const handles: { remove: () => void }[] = [];
    let rewardReceived = false;

    const cleanup = () => {
      handles.forEach(h => { try { h.remove(); } catch {} });
      handles.length = 0;
    };

    try {
      // Register listeners BEFORE preparing the ad
      handles.push(await AdMob.addListener(RewardAdPluginEvents.Loaded, () => {
        onLoaded?.();
      }));

      handles.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, async () => {
        rewardReceived = true;
        try { await onRewarded(); } catch (e) { console.error('[AdMob] onRewarded error:', e); }
      }));

      handles.push(await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        cleanup();
        onDismissed();
      }));

      handles.push(await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (err: any) => {
        cleanup();
        const msg = err?.message ?? 'Ad failed to load. Check your internet connection.';
        console.error('[AdMob] FailedToLoad:', err);
        onError(msg);
      }));

      handles.push(await AdMob.addListener(RewardAdPluginEvents.FailedToShow, (err: any) => {
        cleanup();
        const msg = err?.message ?? 'Ad could not be displayed.';
        console.error('[AdMob] FailedToShow:', err);
        onError(msg);
      }));

      // Load the ad
      await AdMob.prepareRewardVideoAd({
        adId:      AD_IDS.rewarded,
        isTesting: !IS_PROD,
      });

      // Show — launches native fullscreen overlay
      await AdMob.showRewardVideoAd();

    } catch (err: any) {
      cleanup();
      onError(err?.message ?? 'Unexpected AdMob error.');
    }
  },

  // ── Banner ────────────────────────────────────────────────────────────────
  async showBanner(): Promise<void> {
    if (!Capacitor.isNativePlatform() || bannerActive) return;
    if (!initialized) await this.initialize();
    const mod = await getAdMob();
    if (!mod) return;
    try {
      const { AdMob, BannerAdPosition, BannerAdSize } = mod;
      await AdMob.showBanner({
        adId:      AD_IDS.banner,
        adSize:    BannerAdSize.ADAPTIVE_BANNER,
        position:  BannerAdPosition.BOTTOM_CENTER,
        margin:    60,          // clears the navbar
        isTesting: !IS_PROD,
      });
      bannerActive = true;
    } catch (err) {
      console.error('[AdMob] showBanner failed:', err);
    }
  },

  async removeBanner(): Promise<void> {
    if (!Capacitor.isNativePlatform() || !bannerActive) return;
    const mod = await getAdMob();
    if (!mod) return;
    try {
      await mod.AdMob.removeBanner();
      bannerActive = false;
    } catch (err) {
      console.error('[AdMob] removeBanner failed:', err);
    }
  },

  get isBannerActive() { return bannerActive; },
  get isInitialized()  { return initialized;  },
};
