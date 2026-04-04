/**
 * src/hooks/useAds.ts
 *
 * Connects the AdMob service to Firestore.
 *
 * Key design rule: the ONLY source of truth for ad progress is Firestore.
 * No local counter lives here. The App.tsx modal calls startWatchAd() and
 * receives callbacks that drive modal state transitions.
 */

import { useState, useCallback } from 'react';
import { AdLog, Offer } from '../types';
import { firebaseService } from '../services/firebase';
import { admobService } from '../services/admob';

export interface WatchAdResult {
  boostLevel:            number;
  currentLevelAdCounter: number;
  adsNeeded:             number;
  adsWatchedToday:       number;
}

export interface ClaimBoostResult {
  points:         number;
  boostLevel:     number;
  completedLevel: number;
}

export interface StartWatchAdCallbacks {
  /** Ad overlay is ready to appear — transition modal to "watching" state. */
  onLoaded:    () => void;
  /**
   * Ad completed + Firestore updated.
   * result is the server-confirmed state (null if Firestore write failed).
   * Transition modal to "rewarded" state.
   */
  onRewarded:  (result: WatchAdResult | null) => void;
  /**
   * Native overlay closed — user is back in the app.
   * If onRewarded already fired, show the Claim/Next-Ad button.
   * If it didn't fire, user dismissed early — close modal without awarding.
   */
  onDismissed: () => void;
  /** Ad failed to load — show error in modal. */
  onError:     (message: string) => void;
}

export function useAds(uid?: string) {
  const [logs,      setLogs]      = useState<AdLog[]>([]);
  const [offers,    setOffers]    = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Offer subscription ────────────────────────────────────────────────────
  const onOffersChange = useCallback(() => {
    setIsLoading(true);
    const unsub = firebaseService.onOffersChange((data) => {
      setOffers(data);
      setIsLoading(false);
    });
    return unsub;
  }, []);

  // ── Debug log helper ──────────────────────────────────────────────────────
  const addLog = useCallback((
    type: AdLog['type'],
    event: AdLog['event'],
    message?: string
  ) => {
    setLogs(prev => [{
      id:        Math.random().toString(36).slice(2, 11),
      type, event,
      timestamp: new Date().toISOString(),
      message:   message ?? '',
    } as AdLog, ...prev].slice(0, 100));
  }, []);

  // ── Start Watch Ad ────────────────────────────────────────────────────────
  /**
   * Starts loading and showing a rewarded ad.
   * Returns immediately — the caller receives progress via callbacks.
   *
   * Flow:
   *   startWatchAd({ onLoaded, onRewarded, onDismissed, onError })
   *     → onLoaded()                      modal shows "ad is playing"
   *     → [user watches fullscreen ad]
   *     → onRewarded(WatchAdResult|null)  Firestore updated, modal ready for Claim
   *     → onDismissed()                   native overlay gone, show Claim button
   */
  const startWatchAd = useCallback((callbacks: StartWatchAdCallbacks): void => {
    if (!uid) {
      callbacks.onError('User not authenticated.');
      return;
    }

    addLog('rewarded', 'load', 'Requesting rewarded ad…');

    admobService.showRewardedAd({
      onLoaded: () => {
        addLog('rewarded', 'show', 'Ad overlay appeared');
        callbacks.onLoaded();
      },

      onRewarded: async () => {
        addLog('rewarded', 'reward', 'User earned reward — writing to Firestore…');
        try {
          const result = await firebaseService.recordAdWatch(uid);
          addLog('rewarded', 'reward',
            `Firestore confirmed: ${result.currentLevelAdCounter}/${result.adsNeeded} (Level ${result.boostLevel})`
          );
          callbacks.onRewarded(result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          addLog('rewarded', 'error', `Firestore write failed: ${msg}`);
          callbacks.onRewarded(null);
        }
      },

      onDismissed: () => {
        addLog('rewarded', 'show', 'Ad overlay dismissed');
        callbacks.onDismissed();
      },

      onError: (msg) => {
        addLog('rewarded', 'error', `Ad error: ${msg}`);
        callbacks.onError(msg);
      },
    });
  }, [uid, addLog]);

  // ── Claim Boost Reward ────────────────────────────────────────────────────
  const claimBoostReward = useCallback(async (): Promise<ClaimBoostResult | null> => {
    if (!uid) return null;
    try {
      const result = await firebaseService.claimBoostReward(uid);
      addLog('rewarded', 'reward',
        `Level ${result.completedLevel} claimed — +100 pts. Next: Level ${result.boostLevel}`
      );
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog('rewarded', 'error', `claimBoostReward failed: ${msg}`);
      return null;
    }
  }, [uid, addLog]);

  return {
    logs, addLog,
    startWatchAd,
    claimBoostReward,
    offers, isLoading, onOffersChange,
  };
}
