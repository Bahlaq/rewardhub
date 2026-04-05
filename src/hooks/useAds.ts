import { useState, useCallback, useRef } from 'react';
import { Offer } from '../types';
import { firebaseService } from '../services/firebase';
import { Capacitor } from '@capacitor/core';

let AdMobPlugin: any = null;
let RewardAdEvents: any = null;
let admobReady = false;
let admobInitPromise: Promise<boolean> | null = null;

const AD_IDS = {
  banner:   import.meta.env.VITE_ADMOB_BANNER_ID   || 'ca-app-pub-3940256099942544/6300978111',
  rewarded: import.meta.env.VITE_ADMOB_REWARDED_ID  || 'ca-app-pub-3940256099942544/5224354917',
  appOpen:  import.meta.env.VITE_ADMOB_APP_OPEN_ID  || 'ca-app-pub-3940256099942544/9257395921',
};

async function initAdMob(): Promise<boolean> {
  if (admobReady) return true;
  if (!Capacitor.isNativePlatform()) return false;
  if (admobInitPromise) return admobInitPromise;
  admobInitPromise = (async () => {
    try {
      const mod = await import('@capacitor-community/admob');
      AdMobPlugin = mod.AdMob;
      RewardAdEvents = mod.RewardAdPluginEvents;
      await AdMobPlugin.initialize({ initializeForTesting: false });
      admobReady = true;
      console.log('[AdMob] Initialized');
      return true;
    } catch (err) { console.error('[AdMob] Init failed:', err); return false; }
  })();
  return admobInitPromise;
}

export function useAds(uid?: string) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const bannerShownRef = useRef(false);
  const isNative = Capacitor.isNativePlatform();

  const onOffersChange = useCallback(() => {
    setIsLoading(true);
    return firebaseService.onOffersChange(data => { setOffers(data); setIsLoading(false); });
  }, []);

  // ─── NATIVE BANNER ───────────────────────────────────────────────
  const showBanner = useCallback(async () => {
    if (!isNative) return;
    const ready = await initAdMob();
    if (!ready || !AdMobPlugin) return;
    try {
      if (!bannerShownRef.current) {
        await AdMobPlugin.showBanner({ adId: AD_IDS.banner, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: 100, isTesting: !import.meta.env.VITE_ADMOB_BANNER_ID });
        bannerShownRef.current = true;
      } else { await AdMobPlugin.resumeBanner(); }
    } catch (err) { console.error('[AdMob] Banner error:', err); }
  }, [isNative]);

  const hideBanner = useCallback(async () => {
    if (!isNative || !admobReady || !AdMobPlugin || !bannerShownRef.current) return;
    try { await AdMobPlugin.hideBanner(); } catch {}
  }, [isNative]);

  // ─── REWARDED AD — resolves ONLY on dismiss ─────────────────────
  const showRewardedAdAndWait = useCallback(async (): Promise<boolean> => {
    if (!isNative) return false;
    const ready = await initAdMob();
    if (!ready || !AdMobPlugin || !RewardAdEvents) return false;

    return new Promise(async (resolve) => {
      let wasRewarded = false;
      const listeners: any[] = [];
      const cleanup = () => { listeners.forEach(l => { try { l.remove(); } catch {} }); };

      try {
        listeners.push(await AdMobPlugin.addListener(RewardAdEvents.Rewarded, () => { wasRewarded = true; }));
        listeners.push(await AdMobPlugin.addListener(RewardAdEvents.Dismissed, () => { cleanup(); resolve(wasRewarded); }));
        listeners.push(await AdMobPlugin.addListener(RewardAdEvents.FailedToShow, () => { cleanup(); resolve(false); }));
        listeners.push(await AdMobPlugin.addListener(RewardAdEvents.FailedToLoad, () => { cleanup(); resolve(false); }));

        await AdMobPlugin.prepareRewardVideoAd({ adId: AD_IDS.rewarded, isTesting: !import.meta.env.VITE_ADMOB_REWARDED_ID });
        await AdMobPlugin.showRewardVideoAd();
        setTimeout(() => { cleanup(); resolve(wasRewarded); }, 120000);
      } catch (err) { console.error('[AdMob] Rewarded error:', err); cleanup(); resolve(false); }
    });
  }, [isNative]);

  const recordAdWatch = useCallback(async () => {
    if (!uid) return null;
    try { return await firebaseService.recordAdWatch(uid); }
    catch (e) { console.error("recordAdWatch:", e); return null; }
  }, [uid]);

  const claimBoostReward = useCallback(async () => {
    if (!uid) return null;
    try { return await firebaseService.claimBoostReward(uid); }
    catch (e) { console.error("claimBoost:", e); return null; }
  }, [uid]);

  const showAppOpenAd = useCallback(async () => {
    if (!isNative) return;
    const ready = await initAdMob();
    if (!ready || !AdMobPlugin) return;
    try {
      if (typeof AdMobPlugin.prepareInterstitial === 'function') {
        await AdMobPlugin.prepareInterstitial({ adId: AD_IDS.appOpen, isTesting: !import.meta.env.VITE_ADMOB_APP_OPEN_ID });
        await AdMobPlugin.showInterstitial();
      }
    } catch (err) { console.warn('[AdMob] App open error:', err); }
  }, [isNative]);

  return {
    offers, isLoading, onOffersChange,
    showRewardedAdAndWait, recordAdWatch, claimBoostReward,
    showBanner, hideBanner, showAppOpenAd, isNative,
  };
}
