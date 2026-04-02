/**
 * src/hooks/useAds.ts
 *
 * Connects the real AdMob SDK (admobService) to Firestore (firebaseService).
 *
 * Flow for a rewarded ad:
 *   1. watchAd() is called from App.tsx when user taps "Watch Ad"
 *   2. admobService.showRewardedAd() prepares and shows the full-screen ad (native)
 *   3. When the user completes watching, AdMob fires the Rewarded event
 *   4. onRewarded() callback calls firebaseService.recordAdWatch()
 *   5. Firestore transaction increments currentLevelAdCounter atomically
 *   6. The Firestore real-time listener in App.tsx updates `user` state
 *   7. HomeScreen re-renders with the correct counter from Firestore
 *
 * IMPORTANT: There is NO local counter anywhere in this hook.
 * The ONLY source of truth for ad progress is Firestore.
 */

import { useState, useCallback } from 'react';
import { AdLog, Offer } from '../types';
import { firebaseService } from '../services/firebase';
import { admobService } from '../services/admob';

// ─── Public return types ──────────────────────────────────────────────────────

export interface WatchAdResult {
  boostLevel:            number;
  currentLevelAdCounter: number; // Firestore-confirmed counter after this ad
  adsNeeded:             number;
  adsWatchedToday:       number;
}

export interface ClaimBoostResult {
  points:         number;
  boostLevel:     number;
  completedLevel: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAds(uid?: string) {
  const [logs,      setLogs]      = useState<AdLog[]>([]);
  const [offers,    setOffers]    = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Offer subscription ──────────────────────────────────────────────────────
  const onOffersChange = useCallback(() => {
    setIsLoading(true);
    const unsub = firebaseService.onOffersChange((data) => {
      setOffers(data);
      setIsLoading(false);
    });
    return unsub;
  }, []);

  // ── Debug logging ───────────────────────────────────────────────────────────
  const addLog = useCallback(
    (type: AdLog['type'], event: AdLog['event'], message?: string) => {
      setLogs((prev) =>
        [
          {
            id:        Math.random().toString(36).slice(2, 11),
            type,
            event,
            timestamp: new Date().toISOString(),
            message:   message ?? '',
          } as AdLog,
          ...prev,
        ].slice(0, 100)
      );
    },
    []
  );

  // ── Watch Ad ────────────────────────────────────────────────────────────────
  /**
   * Shows a real AdMob rewarded ad.
   * Returns the Firestore-confirmed state after the user earns the reward.
   * Returns null if the ad was not watched or an error occurred.
   *
   * The caller (App.tsx) should use the returned `currentLevelAdCounter`
   * and `adsNeeded` as the single source of truth for the UI.
   * Do NOT maintain any additional local counter alongside this.
   */
  const watchAd = useCallback(async (): Promise<WatchAdResult | null> => {
    if (!uid) {
      addLog('rewarded', 'error', 'watchAd called without uid — user not authenticated');
      return null;
    }

    addLog('rewarded', 'load', 'Preparing rewarded ad…');

    return new Promise<WatchAdResult | null>((resolve) => {
      admobService.showRewardedAd(
        // ── onRewarded: called by AdMob SDK when user earns the reward ────────
        async () => {
          addLog('rewarded', 'show', 'Ad completed — recording in Firestore…');
          try {
            const result = await firebaseService.recordAdWatch(uid);
            addLog(
              'rewarded',
              'reward',
              `Firestore confirmed — counter: ${result.currentLevelAdCounter}/${result.adsNeeded} (Level ${result.boostLevel})`
            );
            resolve(result);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            addLog('rewarded', 'error', `Firestore write failed: ${msg}`);
            resolve(null);
          }
        },

        // ── onError: called if the ad fails to load or show ──────────────────
        (errorMsg) => {
          addLog('rewarded', 'error', `Ad error: ${errorMsg}`);
          resolve(null);
        }
      );
    });
  }, [uid, addLog]);

  // ── Claim Boost Reward ──────────────────────────────────────────────────────
  /**
   * Atomically in Firestore:
   *   - points += 100
   *   - boostLevel += 1
   *   - currentLevelAdCounter = 0
   *   - Writes earn history document (fields: uid, type, points, message, timestamp)
   *
   * This will REJECT server-side if currentLevelAdCounter < boostLevel,
   * providing a double-protection against premature claims.
   */
  const claimBoostReward = useCallback(async (): Promise<ClaimBoostResult | null> => {
    if (!uid) {
      addLog('rewarded', 'error', 'claimBoostReward called without uid');
      return null;
    }
    try {
      const result = await firebaseService.claimBoostReward(uid);
      addLog(
        'rewarded',
        'reward',
        `Level ${result.completedLevel} claimed — +100 pts. Total: ${result.points}. Next: Level ${result.boostLevel}`
      );
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog('rewarded', 'error', `claimBoostReward failed: ${msg}`);
      return null;
    }
  }, [uid, addLog]);

  return {
    logs,
    addLog,
    watchAd,
    claimBoostReward,
    offers,
    isLoading,
    onOffersChange,
  };
}
