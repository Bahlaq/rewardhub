// useAds — v13.6.0 (2026-04-22). Platform-aware ad IDs (iOS vs Android).
import { useState, useCallback, useRef } from 'react';
import { Offer } from '../types';
import { firebaseService } from '../services/firebase';
import { Capacitor } from '@capacitor/core';

let AdMobPlugin: any = null;
let RewardAdEvents: any = null;
let admobReady = false;
let admobInitPromise: Promise<boolean> | null = null;

// ─── Platform-specific ad units ───────────────────────────────────
// iOS units are hardcoded to your production IDs. Android keeps the
// env-var override so dev builds can still use Google's test IDs.

const IOS_AD_IDS = {
  banner:   'ca-app-pub-1560161047680443/4382281521',
  rewarded: 'ca-app-pub-1560161047680443/4486223308',
  appOpen:  'ca-app-pub-1560161047680443/4143750015',
};

const ANDROID_AD_IDS = {
  banner:   import.meta.env.VITE_ADMOB_BANNER_ID   || 'ca-app-pub-3940256099942544/6300978111',
  rewarded: import.meta.env.VITE_ADMOB_REWARDED_ID || 'ca-app-pub-3940256099942544/5224354917',
  appOpen:  import.meta.env.VITE_ADMOB_APP_OPEN_ID || 'ca-app-pub-1560161047680443/6918582002',
};

const IS_IOS = Capacitor.getPlatform() === 'ios';
const AD_IDS = IS_IOS ? IOS_AD_IDS : ANDROID_AD_IDS;

// iOS IDs are real production IDs — never mark them as testing.
// Android respects the env-var presence as the "is this production?" signal.
const IOS_IS_TESTING = false;
const ANDROID_IS_TESTING_BANNER   = !import.meta.env.VITE_ADMOB_BANNER_ID;
const ANDROID_IS_TESTING_REWARDED = !import.meta.env.VITE_ADMOB_REWARDED_ID;
const ANDROID_IS_TESTING_APPOPEN  = !import.meta.env.VITE_ADMOB_APP_OPEN_ID;

async function initAdMob(): Promise<boolean> {
  if (admobReady) return true;
  if (!Capacitor.isNativePlatform()) return false;
  if (admobInitPromise) return admobInitPromise;

  admobInitPromise = (async function () {
    try {
      var mod = await import('@capacitor-community/admob');
      AdMobPlugin = mod.AdMob;
      RewardAdEvents = mod.RewardAdPluginEvents;
      await AdMobPlugin.initialize({ initializeForTesting: false });
      admobReady = true;
      console.log('[AdMob] Initialized OK on', Capacitor.getPlatform());
      return true;
    } catch (err) {
      console.error('[AdMob] Init failed:', err);
      admobInitPromise = null;
      return false;
    }
  })();

  return admobInitPromise;
}

export function initAdMobEarly(): Promise<boolean> {
  return initAdMob();
}

export function useAds(uid?: string) {
  var [offers, setOffers] = useState<Offer[]>([]);
  var [isLoading, setIsLoading] = useState(true);
  var bannerRef = useRef(false);
  var isNative = Capacitor.isNativePlatform();

  var onOffersChange = useCallback(function () {
    setIsLoading(true);
    return firebaseService.onOffersChange(function (data) {
      setOffers(data);
      setIsLoading(false);
    });
  }, []);

  var showBanner = useCallback(async function () {
    if (!isNative) return;
    var ok = await initAdMob();
    if (!ok || !AdMobPlugin) return;
    try {
      if (!bannerRef.current) {
        await AdMobPlugin.showBanner({
          adId: AD_IDS.banner,
          adSize: 'ADAPTIVE_BANNER',
          position: 'BOTTOM_CENTER',
          margin: 100,
          isTesting: IS_IOS ? IOS_IS_TESTING : ANDROID_IS_TESTING_BANNER,
        });
        bannerRef.current = true;
      } else {
        await AdMobPlugin.resumeBanner();
      }
    } catch (e) {
      console.error('[Banner]', e);
    }
  }, [isNative]);

  var hideBanner = useCallback(async function () {
    if (!isNative || !admobReady || !AdMobPlugin || !bannerRef.current) return;
    try {
      await AdMobPlugin.hideBanner();
    } catch (e) {
      // silent
    }
  }, [isNative]);

  var showRewardedAdAndWait = useCallback(async function (): Promise<boolean> {
    if (!isNative) return false;
    var ok = await initAdMob();
    if (!ok || !AdMobPlugin || !RewardAdEvents) return false;

    return new Promise(async function (resolve) {
      var rewarded = false;
      var listeners: any[] = [];

      function cleanup() {
        for (var i = 0; i < listeners.length; i++) {
          try { listeners[i].remove(); } catch (e) { /* silent */ }
        }
      }

      try {
        listeners.push(await AdMobPlugin.addListener(RewardAdEvents.Rewarded, function () { rewarded = true; }));
        listeners.push(await AdMobPlugin.addListener(RewardAdEvents.Dismissed, function () { cleanup(); resolve(rewarded); }));
        listeners.push(await AdMobPlugin.addListener(RewardAdEvents.FailedToShow, function () { cleanup(); resolve(false); }));
        listeners.push(await AdMobPlugin.addListener(RewardAdEvents.FailedToLoad, function () { cleanup(); resolve(false); }));

        await AdMobPlugin.prepareRewardVideoAd({
          adId: AD_IDS.rewarded,
          isTesting: IS_IOS ? IOS_IS_TESTING : ANDROID_IS_TESTING_REWARDED,
        });
        await AdMobPlugin.showRewardVideoAd();

        setTimeout(function () { cleanup(); resolve(rewarded); }, 120000);
      } catch (err) {
        console.error('[Rewarded]', err);
        cleanup();
        resolve(false);
      }
    });
  }, [isNative]);

  var showAppOpenAd = useCallback(async function (): Promise<void> {
    if (!isNative) return;
    var ok = await initAdMob();
    if (!ok || !AdMobPlugin) return;

    try {
      console.log('[AppOpen] Preparing:', AD_IDS.appOpen);
      await AdMobPlugin.prepareAppOpenAd({
        adId: AD_IDS.appOpen,
        isTesting: IS_IOS ? IOS_IS_TESTING : ANDROID_IS_TESTING_APPOPEN,
      });
      console.log('[AppOpen] Showing...');
      await AdMobPlugin.showAppOpenAd();
      console.log('[AppOpen] Shown OK');
    } catch (err: any) {
      console.warn('[AppOpen] Failed:', err && err.message ? err.message : err);
    }
  }, [isNative]);

  var recordAdWatch = useCallback(async function () {
    if (!uid) return null;
    try {
      return await firebaseService.recordAdWatch(uid);
    } catch (e) {
      console.error('recordAdWatch:', e);
      return null;
    }
  }, [uid]);

  var claimBoostReward = useCallback(async function () {
    if (!uid) return null;
    try {
      return await firebaseService.claimBoostReward(uid);
    } catch (e) {
      console.error('claimBoost:', e);
      return null;
    }
  }, [uid]);

  return {
    offers: offers,
    isLoading: isLoading,
    onOffersChange: onOffersChange,
    showRewardedAdAndWait: showRewardedAdAndWait,
    recordAdWatch: recordAdWatch,
    claimBoostReward: claimBoostReward,
    showBanner: showBanner,
    hideBanner: hideBanner,
    showAppOpenAd: showAppOpenAd,
    isNative: isNative,
  };
}
