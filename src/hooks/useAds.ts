import { useState, useCallback, useRef } from 'react';
import { AdLog, Offer } from '../types';
import { firebaseService } from '../services/firebase';
import { Capacitor } from '@capacitor/core';

// ═══════════════════════════════════════════════════════════════════════
// v11.0.0: Event-Driven AdMob Architecture
//
// ROOT CAUSE OF "REVERSE FLOW" BUG:
//   Old code: handleWatchAd() → open modal (5s timer shows FIRST) → 
//     user clicks Continue → handleAdReward() → watchAd() → 
//     simulateAd() (ANOTHER hidden 3s timer) → then native ad.
//   Result: Countdown before ad, not after. Two stacked timers.
//
// NEW ARCHITECTURE:
//   showRewardedAdAndWait() wraps AdMob events in a Promise.
//   The Promise resolves ONLY when RewardAdPluginEvents.Dismissed fires.
//   No modal appears until AFTER the ad sequence completes.
//   
//   Native: Watch Ad tap → AdMob fullscreen IMMEDIATELY → dismiss → record
//   Web:    Watch Ad tap → Simulator modal (the "ad") → complete → record
//
//   Multi-ad sequential: Loop N times, each iteration waits for dismiss.
//   Claim appears ONLY after the final ad dismiss.
// ═══════════════════════════════════════════════════════════════════════

let AdMobPlugin: any = null;
let RewardAdEvents: any = null;
let BannerAdEvents: any = null;
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
      BannerAdEvents = mod.BannerAdPluginEvents;
      
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
      setOffers(data); setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const addLog = useCallback((type: AdLog['type'], event: AdLog['event'], message?: string) => {
    const adId = type === 'banner' ? AD_IDS.banner : type === 'rewarded' ? AD_IDS.rewarded : type === 'app_open' ? AD_IDS.appOpen : 'N/A';
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9), type, event,
      timestamp: new Date().toISOString(),
      message: `${message || ''} (${adId.slice(0, 20)}...)`,
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
      setIsBannerVisible(true);
    }
  }, [isNative]);

  const hideBanner = useCallback(async () => {
    setIsBannerVisible(false);
    if (!isNative || !admobReady || !AdMobPlugin || !bannerShownRef.current) return;
    try { await AdMobPlugin.hideBanner(); } catch {}
  }, [isNative]);

  // ═══════════════════════════════════════════════════════════════════
  // showRewardedAdAndWait() — THE CORE FIX
  //
  // Wraps the AdMob rewarded ad lifecycle in a single Promise:
  //   1. Prepares (loads) the ad
  //   2. Shows the ad (fullscreen native UI takes over immediately)
  //   3. Listens for Rewarded event (user watched enough)
  //   4. Listens for Dismissed event (user closed the ad)
  //   5. Cleans up listeners
  //   6. Resolves with true if reward was earned, false otherwise
  //
  // The Promise does NOT resolve until the ad is DISMISSED.
  // This means any code after `await showRewardedAdAndWait()` runs
  // ONLY after the user has closed the ad — exactly what the user wants.
  // ═══════════════════════════════════════════════════════════════════
  const showRewardedAdAndWait = useCallback(async (): Promise<boolean> => {
    if (!isNative) return false;
    const ready = await initAdMob();
    if (!ready || !AdMobPlugin || !RewardAdEvents) return false;

    return new Promise(async (resolve) => {
      let wasRewarded = false;
      const listeners: any[] = [];

      const cleanup = () => {
        listeners.forEach(l => { try { l.remove(); } catch {} });
      };

      try {
        // Register event listeners BEFORE showing the ad
        listeners.push(
          await AdMobPlugin.addListener(RewardAdEvents.Rewarded, () => {
            wasRewarded = true;
            addLog('rewarded', 'reward', 'User earned reward');
          })
        );

        listeners.push(
          await AdMobPlugin.addListener(RewardAdEvents.Dismissed, () => {
            addLog('rewarded', 'show', 'Ad dismissed by user');
            cleanup();
            resolve(wasRewarded);
          })
        );

        listeners.push(
          await AdMobPlugin.addListener(RewardAdEvents.FailedToShow, (err: any) => {
            addLog('rewarded', 'error', `Failed to show: ${err?.message || 'unknown'}`);
            cleanup();
            resolve(false);
          })
        );

        listeners.push(
          await AdMobPlugin.addListener(RewardAdEvents.FailedToLoad, (err: any) => {
            addLog('rewarded', 'error', `Failed to load: ${err?.message || 'unknown'}`);
            cleanup();
            resolve(false);
          })
        );

        // Prepare (load) the ad
        addLog('rewarded', 'load', 'Loading rewarded ad...');
        await AdMobPlugin.prepareRewardVideoAd({
          adId: AD_IDS.rewarded,
          isTesting: !import.meta.env.VITE_ADMOB_REWARDED_ID,
        });

        // Show the ad — this triggers the fullscreen native UI IMMEDIATELY
        addLog('rewarded', 'show', 'Showing rewarded ad');
        await AdMobPlugin.showRewardVideoAd();

        // The promise resolves in the Dismissed listener above.
        // If showRewardVideoAd() somehow resolves without events firing,
        // add a safety timeout:
        setTimeout(() => { cleanup(); resolve(wasRewarded); }, 120000); // 2min safety

      } catch (err: any) {
        addLog('rewarded', 'error', err.message || String(err));
        cleanup();
        resolve(false);
      }
    });
  }, [isNative, addLog]);

  // ─── RECORD AD WATCH (Firestore only) ───────────────────────────
  const recordAdWatch = useCallback(async () => {
    if (!uid) return null;
    try { return await firebaseService.recordAdWatch(uid); }
    catch (error) { console.error("recordAdWatch failed:", error); return null; }
  }, [uid]);

  // ─── CLAIM BOOST REWARD ──────────────────────────────────────────
  const claimBoostReward = useCallback(async () => {
    if (!uid) return null;
    try { return await firebaseService.claimBoostReward(uid); }
    catch (error) { console.error("claimBoost failed:", error); return null; }
  }, [uid]);

  // ─── APP OPEN AD ─────────────────────────────────────────────────
  const showAppOpenAd = useCallback(async () => {
    if (!isNative) return;
    const ready = await initAdMob();
    if (!ready || !AdMobPlugin) return;
    try {
      // App Open ads may not be available in all plugin versions
      if (typeof AdMobPlugin.prepareInterstitial === 'function') {
        await AdMobPlugin.prepareInterstitial({
          adId: AD_IDS.appOpen,
          isTesting: !import.meta.env.VITE_ADMOB_APP_OPEN_ID,
        });
        await AdMobPlugin.showInterstitial();
        addLog('app_open', 'show', 'App open ad shown');
      }
    } catch (err: any) {
      console.warn('[AdMob] App open ad error:', err);
    }
  }, [isNative, addLog]);

  return {
    logs, addLog, offers, isLoading, onOffersChange,
    showRewardedAdAndWait, recordAdWatch, claimBoostReward,
    showBanner, hideBanner, isBannerVisible,
    showAppOpenAd, isNative,
  };
}
