import { useState, useCallback, useEffect } from 'react';
import { AdLog, Offer } from '../types';
import { firebaseService } from '../services/firebase';

export function useAds(uid?: string) {
  const [logs, setLogs] = useState<AdLog[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const onOffersChange = useCallback(() => {
    setIsLoading(true);
    // Version 7.4.0: Fetch ALL offers once for client-side filtering
    const unsubscribe = firebaseService.onOffersChange((data) => {
      setOffers(data);
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const addLog = useCallback((type: AdLog['type'], event: AdLog['event'], message?: string) => {
    // AdMob Unit IDs should be set in environment variables (VITE_ADMOB_*)
    // App ID is hardcoded in AndroidManifest.xml: ca-app-pub-1560161047680443~4972275282
    const adId = 
      type === 'banner' ? import.meta.env.VITE_ADMOB_BANNER_ID :
      type === 'rewarded' ? import.meta.env.VITE_ADMOB_REWARDED_ID :
      type === 'app_open' ? import.meta.env.VITE_ADMOB_APP_OPEN_ID : 
      'N/A';

    const newLog: AdLog = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      event,
      timestamp: new Date().toISOString(),
      message: `${message || ''} ${adId ? `(ID: ${adId.slice(0, 8)}...)` : ''}`,
    };
    setLogs(prev => [newLog, ...prev].slice(0, 100));
  }, []);

  const simulateAd = useCallback(async (type: AdLog['type']): Promise<boolean> => {
    addLog(type, 'load');
    await new Promise(resolve => setTimeout(resolve, 1000));
    addLog(type, 'show');
    
    if (type === 'rewarded') {
      await new Promise(resolve => setTimeout(resolve, 3000));
      addLog(type, 'reward', 'User watched full video');
      return true;
    }
    
    return true;
  }, [addLog]);

  const watchAd = useCallback(async () => {
    const success = await simulateAd('rewarded');
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
  }, [simulateAd, uid]);

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

  return { logs, addLog, simulateAd, watchAd, claimBoostReward, offers, isLoading, onOffersChange };
}
