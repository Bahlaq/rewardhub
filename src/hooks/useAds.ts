import { useState, useCallback } from 'react';
import { AdLog, Offer } from '../types';
import { firebaseService } from '../services/firebase';

export interface WatchAdResult {
  boostLevel: number;
  currentLevelAdCounter: number;
  adsNeeded: number;
  adsWatchedToday: number;
}

export interface ClaimBoostResult {
  points: number;
  boostLevel: number;
  completedLevel: number;
}

export function useAds(uid?: string) {
  const [logs, setLogs] = useState<AdLog[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Offer subscription (call once, returns unsubscribe fn) ──────────────
  const onOffersChange = useCallback(() => {
    setIsLoading(true);
    const unsub = firebaseService.onOffersChange((data) => {
      setOffers(data);
      setIsLoading(false);
    });
    return unsub;
  }, []);

  // ── Logging ──────────────────────────────────────────────────────────────
  const addLog = useCallback(
    (type: AdLog['type'], event: AdLog['event'], message?: string) => {
      const entry: AdLog = {
        id: Math.random().toString(36).slice(2, 11),
        type,
        event,
        timestamp: new Date().toISOString(),
        message: message ?? '',
      };
      setLogs((prev) => [entry, ...prev].slice(0, 100));
    },
    []
  );

  // ── Record one ad watch in Firestore ──────────────────────────────────────
  /**
   * Call this once per real ad watched.
   * Increments currentLevelAdCounter in Firestore.
   * Returns null on error (toast/log handled by caller).
   */
  const watchAd = useCallback(async (): Promise<WatchAdResult | null> => {
    if (!uid) {
      addLog('rewarded', 'error', 'watchAd called without uid');
      return null;
    }
    try {
      const result = await firebaseService.recordAdWatch(uid);
      addLog(
        'rewarded',
        'reward',
        `Ad recorded — counter: ${result.currentLevelAdCounter}/${result.adsNeeded} (Level ${result.boostLevel})`
      );
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog('rewarded', 'error', `recordAdWatch failed: ${msg}`);
      console.error('[useAds] watchAd error:', err);
      return null;
    }
  }, [uid, addLog]);

  // ── Claim boost reward ────────────────────────────────────────────────────
  /**
   * Atomically: points += 100, boostLevel += 1, currentLevelAdCounter = 0.
   * Writes a history entry.
   * Returns null on error.
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
        `Level ${result.completedLevel} claimed! +100 pts → total: ${result.points} pts. Next level: ${result.boostLevel}`
      );
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog('rewarded', 'error', `claimBoostReward failed: ${msg}`);
      console.error('[useAds] claimBoostReward error:', err);
      return null;
    }
  }, [uid, addLog]);

  // ── Simulate ad view (visual countdown handled in modal) ──────────────────
  const simulateAd = useCallback(
    async (type: AdLog['type']): Promise<boolean> => {
      addLog(type, 'load');
      await new Promise((r) => setTimeout(r, 500));
      addLog(type, 'show');
      return true;
    },
    [addLog]
  );

  return {
    logs,
    addLog,
    simulateAd,
    watchAd,
    claimBoostReward,
    offers,
    isLoading,
    onOffersChange,
  };
}
