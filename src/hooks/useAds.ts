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
  appOpen:  import.meta.env.VITE_ADMOB_APP_OPEN_ID  || 'ca-app-pub-1560161047680443/6918582002',
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
      console.log('[AdMob] Ready');
      return true;
    } catch (err) { console.error('[AdMob] Init:', err); return false; }
  })();
  return admobInitPromise;
}

export function useAds(uid?: string) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const bannerRef = useRef(false);
  const isNative = Capacitor.isNativePlatform();

  const onOffersChange = useCallback(() => {
    setIsLoading(true);
    return firebaseService.onOffersChange(data => { setOffers(data); setIsLoading(false); });
  }, []);

  const showBanner = useCallback(async () => {
    if (!isNative) return;
    const ok = await initAdMob(); if (!ok || !AdMobPlugin) return;
    try {
      if (!bannerRef.current) {
        await AdMobPlugin.showBanner({ adId: AD_IDS.banner, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: 100, isTesting: !import.meta.env.VITE_ADMOB_BANNER_ID });
        bannerRef.current = true;
      } else await AdMobPlugin.resumeBanner();
    } catch (e) { console.error('[Banner]', e); }
  }, [isNative]);

  const hideBanner = useCallback(async () => {
    if (!isNative || !admobReady || !AdMobPlugin || !bannerRef.current) return;
    try { await AdMobPlugin.hideBanner(); } catch {}
  }, [isNative]);

  const showRewardedAdAndWait = useCallback(async (): Promise<boolean> => {
    if (!isNative) return false;
    const ok = await initAdMob(); if (!ok || !AdMobPlugin || !RewardAdEvents) return false;
    return new Promise(async resolve => {
      let rewarded = false;
      const ls: any[] = [];
      const clean = () => ls.forEach(l => { try { l.remove(); } catch {} });
      try {
        ls.push(await AdMobPlugin.addListener(RewardAdEvents.Rewarded, () => { rewarded = true; }));
        ls.push(await AdMobPlugin.addListener(RewardAdEvents.Dismissed, () => { clean(); resolve(rewarded); }));
        ls.push(await AdMobPlugin.addListener(RewardAdEvents.FailedToShow, () => { clean(); resolve(false); }));
        ls.push(await AdMobPlugin.addListener(RewardAdEvents.FailedToLoad, () => { clean(); resolve(false); }));
        await AdMobPlugin.prepareRewardVideoAd({ adId: AD_IDS.rewarded, isTesting: !import.meta.env.VITE_ADMOB_REWARDED_ID });
        await AdMobPlugin.showRewardVideoAd();
        setTimeout(() => { clean(); resolve(rewarded); }, 120000);
      } catch { clean(); resolve(false); }
    });
  }, [isNative]);

  const showAppOpenAd = useCallback(async (): Promise<void> => {
    if (!isNative) return;
    const ok = await initAdMob(); if (!ok || !AdMobPlugin) return;
    try {
      console.log('[AppOpen] Preparing...');
      await AdMobPlugin.prepareAppOpenAd({ adId: AD_IDS.appOpen, isTesting: !import.meta.env.VITE_ADMOB_APP_OPEN_ID });
      console.log('[AppOpen] Showing...');
      await AdMobPlugin.showAppOpenAd();
    } catch (e: any) { console.warn('[AppOpen]', e?.message || e); }
  }, [isNative]);

  const recordAdWatch = useCallback(async () => { if (!uid) return null; try { return await firebaseService.recordAdWatch(uid); } catch { return null; } }, [uid]);
  const claimBoostReward = useCallback(async () => { if (!uid) return null; try { return await firebaseService.claimBoostReward(uid); } catch { return null; } }, [uid]);

  return { offers, isLoading, onOffersChange, showRewardedAdAndWait, recordAdWatch, claimBoostReward, 
