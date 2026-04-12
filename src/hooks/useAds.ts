import { useState, useCallback, useRef } from 'react';
import { Offer } from '../types';
import { firebaseService } from '../services/firebase';
import { Capacitor } from '@capacitor/core';

let AdMobPlugin: any = null;
let RewardAdEvents: any = null;
let admobReady = false;
let admobInitPromise: Promise<boolean> | null = null;

const AD_IDS = {
  banner: import.meta.env.VITE_ADMOB_BANNER_ID || 'ca-app-pub-3940256099942544/6300978111',
  rewarded: import.meta.env.VITE_ADMOB_REWARDED_ID || 'ca-app-pub-3940256099942544/5224354917',
  appOpen: import.meta.env.VITE_ADMOB_APP_OPEN_ID || 'ca-app-pub-1560161047680443/6918582002',
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
    } catch (err) {
      console.error('[AdMob] Init failed:', err);
      return false;
    }
  })();

  return admobInitPromise;
}

export function useAds(uid?: string) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const bannerRef = useRef(false);
  const isNative = Capacitor.isNativePlatform();

  // ─── Offers listener ──────────────────────────────────────────
  const onOffersChange = useCallback(() => {
    setIsLoading(true);
    return firebaseService.onOffersChange((data) => {
      setOffers(data);
      setIsLoading(false);
    });
  }, []);

  // ─── Banner ───────────────────────────────────────────────────
  const showBanner = useCallback(async () => {
    if (!isNative) return;
    const ok = await initAdMob();
    if (!ok || !AdMobPlugin) return;
    try {
      if (!bannerRef.current) {
        await AdMobPlugin.showBanner({
          adId: AD_IDS.banner,
          adSize: 'ADAPTIVE_BANNER',
          position: 'BOTTOM_CENTER',
          margin: 100,
          isTesting: !import.meta.env.VITE_ADMOB_BANNER_ID,
        });
        bannerRef.current = true;
      } else {
        await AdMobPlugin.resumeBanner();
      }
    } catch (e) {
      console.error('[Banner]', e);
    }
  }, [isNative]);

  const hideBanner = useCallback(async () => {
    if (!isNative || !admobReady || !AdMobPlugin || !bannerRef.current) return;
    try {
      await AdMobPlugin.hideBanner();
    } catch (e) {
      // silent
    }
  }, [isNative]);

  // ─── Rewarded Ad ──────────────────────────────────────────────
  const showRewardedAdAndWait = useCallback(async (): Promise<boolean> => {
    if (!isNative) return false;
    const ok = await initAdMob();
    if (!ok || !AdMobPlugin || !RewardAdEvents) return false;

    return new Promise(async (resolve) => {
      let rewarded = false;
      const listeners: any[] = [];
      const cleanup = () => {
        listeners.forEach((l) => {
          try { l.remove(); } catch (e) { /* silent */ }
        });
      };

      try {
        listeners.push(
          await AdMobPlugin.addListener(RewardAdEvents.Rewarded, () => {
            rewarded = true;
          })
        );
        listeners.push(
          await AdMobPlugin.addListener(RewardAdEvents.Dismissed, () => {
            cleanup();
            resolve(rewarded);
          })
        );
        listeners.push(
          await AdMobPlugin.addListener(RewardAdEvents.FailedToShow, () => {
            cleanup();
            resolve(false);
          })
        );
        listeners.push(
          await AdMobPlugin.addListener(RewardAdEvents.FailedToLoad, () => {
            cleanup();
            resolve(false);
          })
        );

        await AdMobPlugin.prepareRewardVideoAd({
          adId: AD_IDS.rewarded,
          isTesting: !import.meta.env.VITE_ADMOB_REWARDED_ID,
        });
        await AdMobPlugin.showRewardVideoAd();

        // Safety timeout — resolve after 2 minutes no matter what
        setTimeout(() => {
          cleanup();
          resolve(rewarded);
        }, 120000);
      } catch (err) {
        console.error('[Rewarded]', err);
        cleanup();
        resolve(false);
      }
    });
  }, [isNative]);

  // ─── App Open Ad ──────────────────────────────────────────────
  const showAppOpenAd = useCallback(async (): Promise<void> => {
    if (!isNative) return;
    const ok = await initAdMob();
    if (!ok || !AdMobPlugin) return;

    try {
      console.log('[AppOpen] Preparing...');
      await AdMobPlugin.prepareAppOpenAd({
        adId: AD_IDS.appOpen,
        isTesting: !import.meta.env.VITE_ADMOB_APP_OPEN_ID,
      });
      console.log('[AppOpen] Showing...');
      await AdMobPlugin.showAppOpenAd();
      console.log('[AppOpen] Done');
    } catch (err: any) {
      console.warn('[AppOpen] Failed:', err?.message || err);
    }
  }, [isNative]);

  // ─── Firestore operations ────────────────────────────────────
  const recordAdWatch = useCallback(async () => {
    if (!uid) return null;
    try {
      return await firebaseService.recordAdWatch(uid);
    } catch (e) {
      console.error('recordAdWatch:', e);
      return null;
    }
  }, [uid]);

  const claimBoostReward = useCallback(async () => {
    if (!uid) return null;
    try {
      return await firebaseService.claimBoostReward(uid);
    } catch (e) {
      console.error('claimBoost:', e);
      return null;
    }
  }, [uid]);

  // ─── Return ──────────────────────────────────────────────────
  return {
    offers,
    isLoading,
    onOffersChange,
    showRewardedAdAndWait,
    recordAdWatch,
    claimBoostReward,
    showBanner,
    hideBanner,
    showAppOpenAd,
    isNative,
  };
}
