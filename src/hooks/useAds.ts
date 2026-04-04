import { useState, useCallback, useEffect, useRef } from 'react';
import { AdLog, Offer } from '../types';
import { firebaseService } from '../services/firebase';
import { Capacitor } from '@capacitor/core';

// ─── Version 9.3.0: Real AdMob Integration ───────────────────────────
// AdMob plugin is dynamically imported so the web build doesn't break.
// On web, we fall back to the simulated ad UI (AdMob has NO web support).
// ──────────────────────────────────────────────────────────────────────

let AdMobPlugin: any = null;
let admobReady = false;
let admobInitPromise: Promise<boolean> | null = null;

const AD_IDS = {
  banner:   import.meta.env.VITE_ADMOB_BANNER_ID   || 'ca-app-pub-3940256099942544/6300978111',  // Test fallback
  rewarded: import.meta.env.VITE_ADMOB_REWARDED_ID  || 'ca-app-pub-3940256099942544/5224354917',  // Test fallback
  appOpen:  import.meta.env.VITE_ADMOB_APP_OPEN_ID  || 'ca-app-pub-3940256099942544/9257395921',  // Test fallback
};

async function initAdMob(): Promise<boolean> {
  if (admobReady) return true;
  if (!Capacitor.isNativePlatform()) return false;
  if (admobInitPromise) return admobInitPromise;

  admobInitPromise = (async () => {
    try {
      const mod = await import('@capacitor-community/admob');
      AdMobPlugin = mod.AdMob;
      
      await AdMobPlugin.initialize({
        // Version 9.3.0: Initialize with test device IDs removed for production
        // Add your test device IDs here during development:
        // testingDevices: ['YOUR_DEVICE_ID'],
        initializeForTesting: false,
      });

      admobReady = true;
      console.log('[AdMob] Initialized successfully on native platform');
      return true;
    } catch (err) {
      console.error('[AdMob] Failed to initialize:', err);
      admobReady = false;
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

  // ─── Offer Listener (unchanged) ──────────────────────────────────
  const onOffersChange = useCallback(() => {
    setIsLoading(true);
    const unsubscribe = firebaseService.onOffersChange((data) => {
      setOffers(data);
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  // ─── Log Helper ──────────────────────────────────────────────────
  const addLog = useCallback((type: AdLog['type'], event: AdLog['event'], message?: string) => {
    const adId = 
      type === 'banner'   ? AD_IDS.banner :
      type === 'rewarded'  ? AD_IDS.rewarded :
      type === 'app_open'  ? AD_IDS.appOpen : 'N/A';

    const newLog: AdLog = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      event,
      timestamp: new Date().toISOString(),
      message: `${message || ''} (ID: ${adId.slice(0, 15)}...)`,
    };
    setLogs(prev => [newLog, ...prev].slice(0, 100));
  }, []);

  // ─── Banner Ad Control ───────────────────────────────────────────
  // Version 9.3.0: Show/hide real AdMob banner. On web, this is a no-op
  // and the placeholder banner in HomeScreen handles it visually.

  const showBanner = useCallback(async () => {
    if (!isNative) {
      setIsBannerVisible(true);
      return;
    }
    
    const ready = await initAdMob();
    if (!ready || !AdMobPlugin) {
      setIsBannerVisible(true); // Fallback to placeholder
      return;
    }

    try {
      if (!bannerShownRef.current) {
        addLog('banner', 'load', 'Requesting banner ad');
        await AdMobPlugin.showBanner({
          adId: AD_IDS.banner,
          adSize: 'ADAPTIVE_BANNER',
          position: 'BOTTOM_CENTER',
          margin: 100, // px above bottom to sit above navbar
          isTesting: !import.meta.env.VITE_ADMOB_BANNER_ID, // test mode if no real ID
        });
        bannerShownRef.current = true;
        addLog('banner', 'show', 'Banner displayed');
      } else {
        await AdMobPlugin.resumeBanner();
      }
      setIsBannerVisible(true);
    } catch (err: any) {
      console.error('[AdMob] Banner error:', err);
      addLog('banner', 'error', err.message || String(err));
      setIsBannerVisible(true); // Show placeholder on error
    }
  }, [isNative, addLog]);

  const hideBanner = useCallback(async () => {
    setIsBannerVisible(false);
    if (!isNative || !admobReady || !AdMobPlugin || !bannerShownRef.current) return;
    
    try {
      await AdMobPlugin.hideBanner();
    } catch (err) {
      console.warn('[AdMob] hideBanner error:', err);
    }
  }, [isNative]);

  // ─── Rewarded Ad ─────────────────────────────────────────────────
  // Version 9.3.0: On native → real AdMob rewarded ad
  //                On web    → simulated countdown (AdMob has no web SDK)

  const showNativeRewarded = useCallback(async (): Promise<boolean> => {
    const ready = await initAdMob();
    if (!ready || !AdMobPlugin) return false;

    try {
      addLog('rewarded', 'load', 'Preparing rewarded ad');
      
      // Prepare (preload) the rewarded ad
      const prepOpts = {
        adId: AD_IDS.rewarded,
        isTesting: !import.meta.env.VITE_ADMOB_REWARDED_ID,
      };
      await AdMobPlugin.prepareRewardVideoAd(prepOpts);
      addLog('rewarded', 'show', 'Showing rewarded ad');

      // Show it — this returns a promise that resolves with reward info
      const rewardResult = await AdMobPlugin.showRewardVideoAd();
      console.log('[AdMob] Rewarded ad result:', rewardResult);
      addLog('rewarded', 'reward', 'User completed rewarded ad');
      return true;
    } catch (err: any) {
      console.error('[AdMob] Rewarded ad error:', err);
      addLog('rewarded', 'error', err.message || String(err));
      return false;
    }
  }, [addLog]);

  const simulateAd = useCallback(async (type: AdLog['type']): Promise<boolean> => {
    // Web-only simulated countdown (used by AdSimulatorModal)
    addLog(type, 'load');
    await new Promise(resolve => setTimeout(resolve, 1000));
    addLog(type, 'show');
    
    if (type === 'rewarded') {
      await new Promise(resolve => setTimeout(resolve, 3000));
      addLog(type, 'reward', 'User watched full simulated video');
      return true;
    }
    
    return true;
  }, [addLog]);

  const watchAd = useCallback(async () => {
    let success = false;

    if (isNative) {
      // Try real AdMob first; fall back to simulated if it fails
      success = await showNativeRewarded();
      if (!success) {
        console.warn('[AdMob] Native rewarded failed, falling back to simulated');
        success = await simulateAd('rewarded');
      }
    } else {
      // Web always uses simulated ads
      success = await simulateAd('rewarded');
    }

    if (success && uid) {
      try {
        const result = await firebaseService.recordAdWatch(uid);
        return result;
      } catch (error) {
        console.error("Error recording ad watch:", error);
        return null;
      }
    }
    return null;
  }, [isNative, showNativeRewarded, simulateAd, uid]);

  // ─── App Open Ad ─────────────────────────────────────────────────
  // Version 9.3.0: Actually loads and shows an App Open ad on native.
  // On web this is a no-op (AdMob doesn't support web).

  const showAppOpenAd = useCallback(async () => {
    if (!isNative) {
      addLog('app_open', 'load', 'Skipped — web platform (AdMob is mobile-only)');
      return;
    }

    const ready = await initAdMob();
    if (!ready || !AdMobPlugin) {
      addLog('app_open', 'error', 'AdMob not initialized');
      return;
    }

    try {
      addLog('app_open', 'load', 'Preparing app open ad');
      
      await AdMobPlugin.prepareAppOpenAd({
        adId: AD_IDS.appOpen,
        isTesting: !import.meta.env.VITE_ADMOB_APP_OPEN_ID,
      });

      addLog('app_open', 'show', 'Showing app open ad');
      await AdMobPlugin.showAppOpenAd();
      addLog('app_open', 'reward', 'App open ad completed');
    } catch (err: any) {
      // App Open ads frequently fail (no fill, etc.) — don't crash the app
      console.warn('[AdMob] App Open ad error:', err);
      addLog('app_open', 'error', err.message || String(err));
    }
  }, [isNative, addLog]);

  // ─── Boost Claim (unchanged) ─────────────────────────────────────

  const claimBoostReward = useCallback(async () => {
    if (!uid) return null;
    try {
      const result = await firebaseService.claimBoostReward(uid);
      return result;
    } catch (error) {
      console.error("Error claiming boost reward:", error);
      return null;
    }
  }, [uid]);

  return {
    logs,
    addLog,
    simulateAd,
    watchAd,
    claimBoostReward,
    offers,
    isLoading,
    onOffersChange,
    // Version 9.3.0: New exports for ad lifecycle control
    showBanner,
    hideBanner,
    isBannerVisible,
    showAppOpenAd,
    isNative,
  };
}
