import { useState, useCallback, useRef } from 'react';
import { AdLog, Offer } from '../types';
import { firebaseService } from '../services/firebase';
import { Capacitor } from '@capacitor/core';

// ═══════════════════════════════════════════════════════════════════════
// v10.0.0: Complete rewrite — Clean Separation of Concerns
//
// OLD BUG: watchAd() called simulateAd() which had a hidden 3-second
//   setTimeout, AND the AdSimulatorModal had its own 5-second timer.
//   Result: double timers, double ads, UI chaos on mobile.
//
// NEW ARCHITECTURE:
//   recordAdWatch()        → Firestore ONLY (increment counter, no UI)
//   showNativeRewardedAd() → AdMob SDK ONLY (fullscreen native ad)
//   AdSimulatorModal       → Web ONLY (HTML countdown, no AdMob)
//
// App.tsx orchestrates:
//   Native: showNativeRewardedAd() → on success → recordAdWatch()
//   Web:    Show AdSimulatorModal → on countdown complete → recordAdWatch()
// ═══════════════════════════════════════════════════════════════════════

let AdMobPlugin: any = null;
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
      await AdMobPlugin.initialize({ initializeForTesting: false });
      admobReady = true;
      console.log('[AdMob] Initialized successfully');
      return true;
    } catch (err) {
      console.error('[AdMob] Init failed:', err);
      return false;
    }
  })();

  return admobInitPromise;
}

export function useAds(uid?: string) {
  const [logs, setLogs] = useState<AdLog[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBannerVisible, setIsBannerVisible] = useState(false);
  const bannerShownRef = useRef(false);
  const isNative = Capacitor.isNativePlatform();

  const onOffersChange = useCallback(() => {
    setIsLoading(true);
    const unsubscribe = firebaseService.onOffersChange((data) => {
      setOffers(data);
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const addLog = useCallback((type: AdLog['type'], event: AdLog['event'], message?: string) => {
    const adId =
      type === 'banner' ? AD_IDS.banner :
      type === 'rewarded' ? AD_IDS.rewarded :
      type === 'app_open' ? AD_IDS.appOpen : 'N/A';
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      type, event,
      timestamp: new Date().toISOString(),
      message: `${message || ''} (ID: ${adId.slice(0, 15)}...)`,
    }, ...prev].slice(0, 100));
  }, []);

  // ─── BANNER ──────────────────────────────────────────────────────
  const showBanner = useCallback(async () => {
    if (!isNative) { setIsBannerVisible(true); return; }
    const ready = await initAdMob();
    if (!ready || !AdMobPlugin) { setIsBannerVisible(true); return; }
    try {
      if (!bannerShownRef.current) {
        await AdMobPlugin.showBanner({
          adId: AD_IDS.banner, adSize: 'ADAPTIVE_BANNER',
          position: 'BOTTOM_CENTER', margin: 100,
          isTesting: !import.meta.env.VITE_ADMOB_BANNER_ID,
        });
        bannerShownRef.current = true;
      } else {
        await AdMobPlugin.resumeBanner();
      }
      setIsBannerVisible(true);
    } catch (err: any) {
      console.error('[AdMob] Banner error:', err);
      setIsBannerVisible(true); // fallback to web placeholder
    }
  }, [isNative]);

  const hideBanner = useCallback(async () => {
    setIsBannerVisible(false);
    if (!isNative || !admobReady || !AdMobPlugin || !bannerShownRef.current) return;
    try { await AdMobPlugin.hideBanner(); } catch {}
  }, [isNative]);

  // ─── NATIVE REWARDED AD (AdMob SDK only — no Firestore, no timers) ──
  const showNativeRewardedAd = useCallback(async (): Promise<boolean> => {
    if (!isNative) return false;
    const ready = await initAdMob();
    if (!ready || !AdMobPlugin) return false;
    try {
      addLog('rewarded', 'load', 'Preparing native rewarded ad');
      await AdMobPlugin.prepareRewardVideoAd({
        adId: AD_IDS.rewarded,
        isTesting: !import.meta.env.VITE_ADMOB_REWARDED_ID,
      });
      addLog('rewarded', 'show', 'Showing native rewarded ad');
      await AdMobPlugin.showRewardVideoAd();
      addLog('rewarded', 'reward', 'Native ad completed');
      return true;
    } catch (err: any) {
      console.error('[AdMob] Rewarded error:', err);
      addLog('rewarded', 'error', err.message || String(err));
      return false;
    }
  }, [isNative, addLog]);

  // ─── RECORD AD WATCH (Firestore only — no UI, no timers) ────────
  const recordAdWatch = useCallback(async () => {
    if (!uid) return null;
    try {
      return await firebaseService.recordAdWatch(uid);
    } catch (error) {
      console.error("Error recording ad watch:", error);
      return null;
    }
  }, [uid]);

  // ─── CLAIM BOOST REWARD ──────────────────────────────────────────
  const claimBoostReward = useCallback(async () => {
    if (!uid) return null;
    try {
      return await firebaseService.claimBoostReward(uid);
    } catch (error) {
      console.error("Error claiming boost:", error);
      return null;
    }
  }, [uid]);

  // ─── APP OPEN AD ─────────────────────────────────────────────────
  const showAppOpenAd = useCallback(async () => {
    if (!isNative) { addLog('app_open', 'load', 'Skipped — web platform'); return; }
    const ready = await initAdMob();
    if (!ready || !AdMobPlugin) return;
    try {
      addLog('app_open', 'load', 'Preparing app open ad');
      await AdMobPlugin.prepareAppOpenAd({ adId: AD_IDS.appOpen, isTesting: !import.meta.env.VITE_ADMOB_APP_OPEN_ID });
      await AdMobPlugin.showAppOpenAd();
      addLog('app_open', 'show', 'App open ad shown');
    } catch (err: any) {
      console.warn('[AdMob] App open error:', err);
      addLog('app_open', 'error', err.message || String(err));
    }
  }, [isNative, addLog]);

  return {
    logs, addLog, offers, isLoading, onOffersChange,
    showNativeRewardedAd, recordAdWatch, claimBoostReward,
    showBanner, hideBanner, isBannerVisible,
    showAppOpenAd, isNative,
  };
}
