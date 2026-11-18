// useAds — platform ad units, and iOS startup ordered as
// ATT → UMP consent → Mobile Ads SDK. The SDK latches IDFA at initialize().
import { useState, useCallback, useRef } from 'react';
import { Offer } from '../types';
import { firebaseService } from '../services/firebase';
import { Capacitor } from '@capacitor/core';

let AdMobPlugin: any = null;
let RewardAdEvents: any = null;
let BannerAdEvents: any = null;
let admobReady = false;
let admobInitPromise: Promise<boolean> | null = null;
let adsBlockedByConsent = false;

// ─── Platform-specific ad units ───────────────────────────────────
// These iOS units must belong to the iOS AdMob app
// ca-app-pub-1560161047680443~7734676516 (GADApplicationIdentifier).
// They are not the Android app (~4972275282) and not Google's demo units.
// Android production units come from VITE_ADMOB_* at build time.
// Do not set isTesting:true on iOS: plugin 6.2.0 then substitutes the
// Android demo banner ca-app-pub-3940256099942544/6300978111, which
// does not fill on iOS. The iOS demo banner is .../2934735716.

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

function isIos(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

function adIds() {
  return isIos() ? IOS_AD_IDS : ANDROID_AD_IDS;
}

// iOS IDs above are production units — never mark them as testing.
// Android respects the env-var presence as the "is this production?" signal.
const IOS_IS_TESTING = false;
const ANDROID_IS_TESTING_BANNER   = !import.meta.env.VITE_ADMOB_BANNER_ID;
const ANDROID_IS_TESTING_REWARDED = !import.meta.env.VITE_ADMOB_REWARDED_ID;
const ANDROID_IS_TESTING_APPOPEN  = !import.meta.env.VITE_ADMOB_APP_OPEN_ID;

function testingFlag(kind: 'banner' | 'rewarded' | 'appOpen'): boolean {
  if (isIos()) return IOS_IS_TESTING;
  if (kind === 'banner') return ANDROID_IS_TESTING_BANNER;
  if (kind === 'rewarded') return ANDROID_IS_TESTING_REWARDED;
  return ANDROID_IS_TESTING_APPOPEN;
}

function delay(ms: number): Promise<void> {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function requestAttBeforeAds(): Promise<void> {
  if (!isIos()) return;
  // iOS 17.4 answers requestTrackingAuthorization with .denied and never
  // shows the prompt if it runs before the app is active. The ATT plugin
  // then waits for a later didBecomeActive and the JS promise never
  // resolves. Wait until the first frame has settled, then give up only
  // if the prompt itself hangs.
  await delay(500);
  try {
    var mod: any = await import('capacitor-plugin-app-tracking-transparency');
    var ATT = mod.AppTrackingTransparency || mod.default;
    if (!ATT) return;
    var current = await ATT.getStatus();
    if (current && current.status && current.status !== 'notDetermined') {
      console.log('[ATT] already', current.status);
      return;
    }
    var result: any = await Promise.race([
      ATT.requestPermission(),
      delay(45000).then(function () { return { status: 'timeout' }; }),
    ]);
    console.log('[ATT] status:', result && result.status);
  } catch (e) {
    console.warn('[ATT] non-fatal:', e);
  }
}

async function requestConsentBeforeAds(): Promise<boolean> {
  if (!AdMobPlugin || typeof AdMobPlugin.requestConsentInfo !== 'function') return true;
  var TIMEOUT = { timeout: true };
  try {
    var info: any = await Promise.race([
      AdMobPlugin.requestConsentInfo(),
      delay(8000).then(function () { return TIMEOUT; }),
    ]);
    if (info === TIMEOUT) {
      console.warn('[UMP] timed out; requesting ads anyway');
      return true;
    }
    console.log('[UMP] status:', info && info.status, 'form:', info && info.isConsentFormAvailable);
    if (info && info.status === 'REQUIRED') {
      if (!info.isConsentFormAvailable || typeof AdMobPlugin.showConsentForm !== 'function') {
        console.warn('[UMP] consent required but no form is available');
        return false;
      }
      var after: any = await AdMobPlugin.showConsentForm();
      console.log('[UMP] after form:', after && after.status);
      if (after && after.status === 'REQUIRED') return false;
    }
    return true;
  } catch (e) {
    console.warn('[UMP] non-fatal, ads will still be requested:', e);
    return true;
  }
}

async function initAdMob(): Promise<boolean> {
  if (admobReady) return true;
  if (adsBlockedByConsent) return false;
  if (!Capacitor.isNativePlatform()) return false;
  if (admobInitPromise) return admobInitPromise;

  admobInitPromise = (async function () {
    try {
      await requestAttBeforeAds();
      var mod = await import('@capacitor-community/admob');
      AdMobPlugin = mod.AdMob;
      RewardAdEvents = mod.RewardAdPluginEvents;
      BannerAdEvents = mod.BannerAdPluginEvents;
      var allowed = await requestConsentBeforeAds();
      if (!allowed) {
        adsBlockedByConsent = true;
        console.warn('[AdMob] not initialized: consent required and not obtained');
        return false;
      }
      await AdMobPlugin.initialize({ initializeForTesting: false });
      admobReady = true;
      console.log('[AdMob] Initialized OK on', Capacitor.getPlatform(), adIds());
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
  var bannerLoading = useRef(false);
  var bannerHidden = useRef(false);
  var isNative = Capacitor.isNativePlatform();

  var onOffersChange = useCallback(function () {
    setIsLoading(true);
    return firebaseService.onOffersChange(function (data) {
      setOffers(data);
      setIsLoading(false);
    });
  }, []);

  async function loadBannerOnce(): Promise<boolean> {
    var ids = adIds();
    console.log('[Banner] requesting', ids.banner, 'on', Capacitor.getPlatform());
    var failed = false;
    var loaded = false;
    var failMsg: any = null;
    var listeners: any[] = [];
    function cleanup() {
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i].remove(); } catch (e) { /* silent */ }
      }
    }
    if (BannerAdEvents) {
      listeners.push(await AdMobPlugin.addListener(BannerAdEvents.FailedToLoad, function (err: any) {
        failed = true;
        failMsg = err;
      }));
      listeners.push(await AdMobPlugin.addListener(BannerAdEvents.Loaded, function () {
        loaded = true;
      }));
    }
    var showResult: any;
    try {
      var showPromise = AdMobPlugin.showBanner({
        adId: ids.banner,
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        margin: 100,
        isTesting: testingFlag('banner'),
      }).then(function () { return 'shown'; }, function (err: any) { return err || new Error('showBanner failed'); });
      showResult = await Promise.race([
        showPromise,
        delay(15000).then(function () { return 'timeout'; }),
      ]);
      if (showResult === 'timeout') {
        console.error('[Banner] showBanner timed out');
        return false;
      }
      if (showResult !== 'shown') throw showResult;
      var start = Date.now();
      while (!failed && !loaded && Date.now() - start < 12000) {
        await delay(200);
      }
    } finally {
      cleanup();
    }
    if (loaded && !failed) {
      console.log('[Banner] loaded');
      if (bannerHidden.current) {
        try { await AdMobPlugin.hideBanner(); } catch (e) { /* silent */ }
      }
      return true;
    }
    console.error('[Banner] failed to load', failMsg || '(no load event)');
    return false;
  }

  var showBanner = useCallback(async function () {
    if (!isNative) return;
    bannerHidden.current = false;
    if (bannerRef.current && AdMobPlugin) {
      try {
        await AdMobPlugin.resumeBanner();
        return;
      } catch (e) {
        console.warn('[Banner] resume failed, reloading', e);
        bannerRef.current = false;
      }
    }
    if (bannerLoading.current) return;
    bannerLoading.current = true;
    try {
      var ok = await initAdMob();
      if (!ok || !AdMobPlugin || bannerHidden.current) return;
      var shown = await loadBannerOnce();
      if (!shown && !bannerHidden.current) {
        await delay(2000);
        if (!bannerHidden.current) shown = await loadBannerOnce();
      }
      bannerRef.current = !!shown;
    } catch (e) {
      bannerRef.current = false;
      console.error('[Banner]', e);
    } finally {
      bannerLoading.current = false;
    }
  }, [isNative]);

  var hideBanner = useCallback(async function () {
    bannerHidden.current = true;
    if (!isNative || !admobReady || !AdMobPlugin) return;
    if (!bannerRef.current && !bannerLoading.current) return;
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
        listeners.push(await AdMobPlugin.addListener(RewardAdEvents.FailedToShow, function (err: any) {
          console.error('[Rewarded] failed to show', err);
          cleanup(); resolve(false);
        }));
        listeners.push(await AdMobPlugin.addListener(RewardAdEvents.FailedToLoad, function (err: any) {
          console.error('[Rewarded] failed to load', err);
          cleanup(); resolve(false);
        }));

        var ids = adIds();
        console.log('[Rewarded] requesting', ids.rewarded, 'on', Capacitor.getPlatform());
        await AdMobPlugin.prepareRewardVideoAd({
          adId: ids.rewarded,
          isTesting: testingFlag('rewarded'),
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
    // @capacitor-community/admob@6.2.0 ships NO App Open APIs on iOS
    // (prepareAppOpenAd / showAppOpenAd are missing from pluginMethods).
    // Calling them throws Capacitor Unimplemented and was wiping the UI
    // right after Google sign-in when the T+N timer fired.
    if (isIos()) {
      console.log('[AppOpen] skipped — not supported by AdMob plugin on iOS. Unit', IOS_AD_IDS.appOpen, 'is never requested.');
      return;
    }
    if (typeof AdMobPlugin?.prepareAppOpenAd !== 'function' ||
        typeof AdMobPlugin?.showAppOpenAd !== 'function') {
      console.warn('[AppOpen] skipped — plugin methods missing');
      return;
    }
    var ok = await initAdMob();
    if (!ok || !AdMobPlugin) return;

    try {
      console.log('[AppOpen] Preparing:', adIds().appOpen);
      await AdMobPlugin.prepareAppOpenAd({
        adId: adIds().appOpen,
        isTesting: ANDROID_IS_TESTING_APPOPEN,
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
