import { useState, useCallback } from 'react';
import { AdLog } from '../types';

export function useAds() {
  const [logs, setLogs] = useState<AdLog[]>([]);

  const addLog = useCallback((type: AdLog['type'], event: AdLog['event'], message?: string) => {
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
    console.log(`[Ad ${type}] ${event}: ${message || ''}`);
  }, []);

  const simulateAd = useCallback(async (type: AdLog['type']): Promise<boolean> => {
    addLog(type, 'load');
    
    // Simulate loading delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    addLog(type, 'show');
    
    if (type === 'rewarded') {
      // Simulate watching delay
      await new Promise(resolve => setTimeout(resolve, 3000));
      addLog(type, 'reward', 'User watched full video');
      return true;
    }
    
    return true;
  }, [addLog]);

  return { logs, addLog, simulateAd };
}
