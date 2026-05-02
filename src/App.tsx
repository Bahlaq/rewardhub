import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Gift, User, LayoutDashboard, PlayCircle, TrendingUp, AlertCircle,
  ChevronRight, Zap, History, ExternalLink, ShieldCheck, Trash2, Bell
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { Toast } from '@capacitor/toast';
import { Browser } from '@capacitor/browser';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Offer, UserProfile, Transaction } from './types';
import { useAds, initAdMobEarly } from './hooks/useAds';
import { firebaseService, FirebaseUser, isConfigValid } from './services/firebase';
import { initPushNotifications } from './services/notifications';
import { APP_NAME, APP_VERSION } from './constants';
import {
  HomeScreen, offerMatchesCountry, offerMatchesCategory,
  recordUnlock, buildCountriesList, buildCategoriesList,
  ALL_COUNTRIES, ALL_CATEGORIES,
} from './components/HomeScreen';
import icon from '../assets/icon.png';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const CD_MS = 2 * 60 * 1000;
const CD_KEY = 'rh_cd';

function loadCD(): { s: number } | null {
  try {
    const raw = localStorage.getItem(CD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.s >= CD_MS) { localStorage.removeItem(CD_KEY); return null; }
    return parsed;
  } catch { return null; }
}

const Logo = ({ className }: { className?: string }) => (
  <div className={cn('relative w-full mx-auto', className)}>
    <img src={icon} alt={APP_NAME} className="w-full h-auto object-contain rounded-[2.5rem] shadow-2xl" referrerPolicy="no-referrer" />
  </div>
);

const Navbar = ({ tab, setTab }: { tab: string; setTab: (t: string) => void }) => (
  <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-6 pt-3 z-50"
    style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
    <div className="max-w-md mx-auto flex justify-between">
      {[{ id: 'offers', Icon: LayoutDashboard, label: 'Rewards' }, { id: 'profile', Icon: User, label: 'Profile' }].map(t => (
        <button key={t.id} onClick={() => setTab(t.id)}
          className={cn('flex flex-col items-center gap-1', tab === t.id ? 'text-indigo-600' : 'text-zinc-400')}>
          <t.Icon size={20} strokeWidth={tab === t.id ? 2.5 : 2} />
          <span className="text-[10px] font-medium uppercase tracking-wider">{t.label}</span>
        </button>
      ))}
    </div>
  </nav>
);

const Header = ({ user }: { user: UserProfile }) => (
  <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-zinc-100 px-5 pb-2 z-40"
    style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
    <div className="max-w-md mx-auto flex justify-between items-center">
      <div className="flex items-center gap-3">
        <Logo className="max-w-[36px]" />
        <div>
          <h1 className="text-base font-black text-zinc-900 leading-none">{APP_NAME}</h1>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">Earn while you play</p>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
        <Zap size={14} className="text-indigo-600 fill-indigo-600" />
        <span className="text-sm font-bold text-indigo-700">{Math.max(0, Number(user.points || 0))} pts</span>
      </div>
    </div>
  </header>
);

const WebAdModal = ({ isOpen, onDone, onSkip, num, total }: {
  isOpen: boolean; onDone: () => void; onSkip: () => void; num: number; total: number;
}) => {
  const [t, setT] = useState(5);
  const [fin, setFin] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setT(5); setFin(false);
    const i = setInterval(() => setT(p => { if (p <= 1) { clearInterval(i); setFin(true); return 0; } return p - 1; }), 1000);
    return () => clearInterval(i);
  }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/90">
      <div className="w-full max-w-sm bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800">
        <div className="relative aspect-video bg-zinc-800 flex items-center justify-center">
          <PlayCircle size={48} className="text-zinc-600 animate-pulse" />
          <div className="absolute top-4 left-4 bg-indigo-500/80 px-3 py-1 rounded-full text-white text-xs font-bold">{num}/{total}</div>
          <div className="absolute top-4 right-4 bg-black/50 px-3 py-1 rounded-full text-white text-xs font-bold">{fin ? '✓' : t + 's'}</div>
        </div>
        <div className="p-6 text-center">
          <h3 className="text-lg font-bold text-white mb-2">Sponsored Content</h3>
          <button onClick={() => fin ? onDone() : onSkip()}
            className={cn('w-full py-3 rounded-2xl font-bold mt-4', fin ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-500')}>
            {fin ? 'Continue' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  );
};

const SimpleModal = ({ open, close, children }: { open: boolean; close: () => void; children: React.ReactNode }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6">
      <div onClick={close} className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm rh-fade-in" />
      <div className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden rh-scale-in">
        <div className="p-8">{children}</div>
      </div>
    </div>
  );
};

async function saveFcmToken(uid: string, token: string): Promise<boolean> {
  if (!uid || !token) return false;
  const platform = Capacitor.getPlatform();
  const svc = firebaseService as any;
  if (typeof svc.saveFcmToken !== 'function') { console.error('[FCM] saveFcmToken missing'); return false; }
  const delays = [1000, 2000, 4000];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await svc.saveFcmToken(uid, token, platform);
      console.log('[FCM] token saved on attempt', attempt + 1);
      return true;
    } catch (e) {
      console.error('[FCM] attempt', attempt + 1, 'failed:', e);
      if (attempt < 2) await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  return false;
}

async function requestATTIfNeeded(): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return;
  try {
    const mod: any = await import('capacitor-plugin-app-tracking-transparency');
    const ATT = mod.AppTrackingTransparency || mod.default;
    if (!ATT) return;
    const status = await ATT.getStatus();
    if (status?.status === 'notDetermined') await ATT.requestPermission();
  } catch (e) { console.warn('[ATT] non-fatal:', e); }
}

export default function App() {
  const [tab, setTab] = useState('offers');
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState({ title: '', msg: '', fn: () => {} });
  const [adRunning, setAdRunning] = useState(false);
  const [webOpen, setWebOpen] = useState(false);
  const [webNum, setWebNum] = useState(1);
  const [webTotal, setWebTotal] = useState(1);
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const webRef = useRef<((v: boolean) => void) | null>(null);
  const appOpenShownRef = useRef(false);
  const notifPromptRef = useRef(false);
  const pushInitRef = useRef(false);

  // ─── Cooldown ────────────────────────────────────────────────
  const [cdActive, setCdActive] = useState(false);
  const [cdSec, setCdSec] = useState(0);
  const cdInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const saved = loadCD();
    if (saved) {
      const remaining = CD_MS - (Date.now() - saved.s);
      if (remaining > 0) { setCdActive(true); setCdSec(Math.ceil(remaining / 1000)); runCooldown(remaining); }
    }
    return () => { if (cdInterval.current) clearInterval(cdInterval.current); };
  }, []);

  function runCooldown(ms: number) {
    if (cdInterval.current) clearInterval(cdInterval.current);
    const endTime = Date.now() + ms;
    setCdActive(true); setCdSec(Math.ceil(ms / 1000));
    cdInterval.current = setInterval(() => {
      const remaining = endTime - Date.now();
      if (remaining <= 0) { clearInterval(cdInterval.current!); cdInterval.current = null; setCdActive(false); setCdSec(0); localStorage.removeItem(CD_KEY); }
      else setCdSec(Math.ceil(remaining / 1000));
    }, 1000);
  }

  function startCooldown() { localStorage.setItem(CD_KEY, JSON.stringify({ s: Date.now() })); runCooldown(CD_MS); }

  // ─── Country ─────────────────────────────────────────────────
  const [country, setCountry] = useState(() => localStorage.getItem('rh_country') || ALL_COUNTRIES);
  const onCountryChange = useCallback((c: string) => { setCountry(c); localStorage.setItem('rh_country', c); }, []);

  // ─── Auth ─────────────────────────────────────────────────────
  useEffect(() => {
    const timeout = setTimeout(() => setAuthLoading(false), 5000);
    const unsub = firebaseService.onAuthChange(f => {
      clearTimeout(timeout);
      setFbUser(f);
      setAuthLoading(false);
    });
    return () => { clearTimeout(timeout); unsub(); };
  }, []);

  // ─── Ads ─────────────────────────────────────────────────────
  const { offers, isLoading, onOffersChange, showRewardedAdAndWait, recordAdWatch,
    claimBoostReward, showBanner, hideBanner, showAppOpenAd, isNative } = useAds(fbUser?.uid);

  // ─── Phase 1: error handlers + AdMob warm-up ─────────────────
  useEffect(() => {
    const onUncaught = (ev: ErrorEvent) => { console.error('[Global]', ev.message); ev.preventDefault(); };
    const onRejection = (ev: PromiseRejectionEvent) => { console.error('[Global] rejection:', ev.reason); ev.preventDefault(); };
    window.addEventListener('error', onUncaught);
    window.addEventListener('unhandledrejection', onRejection);
    if (isNative) {
      requestATTIfNeeded().catch(console.warn).finally(() => {
        initAdMobEarly().then(ok => console.log('[AdMob] warm-up:', ok)).catch(console.warn);
      });
    }
    return () => { window.removeEventListener('error', onUncaught); window.removeEventListener('unhandledrejection', onRejection); };
  }, [isNative]);

  // ─── Phase 2: App Open Ad (T+800ms) ──────────────────────────
  useEffect(() => {
    if (!isNative || appOpenShownRef.current) return;
    const t = setTimeout(() => {
      if (appOpenShownRef.current) return;
      appOpenShownRef.current = true;
      showAppOpenAd().catch(console.warn);
    }, 800);
    return () => clearTimeout(t);
  }, [isNative, showAppOpenAd]);

  // ─── Phase 3: In-app notification prompt ─────────────────────
  // Shown 5 seconds after the user lands on the main screen.
  // Replaces the old auto-timer that triggered the system dialog
  // while the app was in the foreground, causing Android OEMs
  // (Samsung/Xiaomi) to kill the activity.
  useEffect(() => {
    if (!isNative || !fbUser?.uid || notifPromptRef.current) return;
    const lastAsked = localStorage.getItem('rh_notif_asked');
    if (lastAsked && Date.now() - parseInt(lastAsked) < 7 * 24 * 60 * 60 * 1000) return;
    const t = setTimeout(() => {
      if (notifPromptRef.current) return;
      notifPromptRef.current = true;
      localStorage.setItem('rh_notif_asked', String(Date.now()));
      setShowNotifPrompt(true);
    }, 5000);
    return () => clearTimeout(t);
  }, [isNative, fbUser?.uid]);

  const handleEnableNotifications = useCallback(() => {
    setShowNotifPrompt(false);
    if (pushInitRef.current || !fbUser?.uid) return;
    pushInitRef.current = true;
    const uid = fbUser.uid;
    initPushNotifications(token => {
      saveFcmToken(uid, token).catch(console.error);
    }).catch(console.error);
  }, [fbUser?.uid]);

  // ─── Firestore listeners ──────────────────────────────────────
  const [fsClaims, setFsClaims] = useState<Transaction[]>([]);
  const [fsHistory, setFsHistory] = useState<Transaction[]>([]);

  useEffect(() => {
    if (!fbUser?.uid) { setUser(null); setFsClaims([]); setFsHistory([]); return; }
    const uid = fbUser.uid;
    // Pre-load cached profile for instant display
    try {
      const cached = localStorage.getItem('profile_' + uid);
      if (cached) setUser(JSON.parse(cached));
    } catch {}
    firebaseService.checkDailyReset(uid);
    const u1 = firebaseService.onProfileChange(uid, p => {
      if (p) {
        setUser(p);
        try { localStorage.setItem('profile_' + uid, JSON.stringify(p)); } catch {}
      } else {
        firebaseService.saveUserProfile({
          uid, email: fbUser.email || (uid.startsWith('local_guest_') ? 'Guest User' : 'Unknown'),
          points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0,
          boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0,
          lastBoostDate: new Date().toDateString(),
        });
      }
    });
    const u2 = firebaseService.onClaimsChange(uid, setFsClaims);
    const u3 = firebaseService.onHistoryChange(uid, setFsHistory);
    return () => { u1(); u2(); u3(); };
  }, [fbUser?.uid]);

  // ─── Filters ─────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORIES);
  const categories = useMemo(() => buildCategoriesList(offers), [offers]);
  const countries = useMemo(() => buildCountriesList(offers), [offers]);
  useEffect(() => { if (!countries.includes(country)) { setCountry(ALL_COUNTRIES); localStorage.setItem('rh_country', ALL_COUNTRIES); } }, [countries, country]);
  useEffect(() => { if (!categories.includes(selectedCategory)) setSelectedCategory(ALL_CATEGORIES); }, [categories, selectedCategory]);

  // ─── Transactions ─────────────────────────────────────────────
  const [localTx, setLocalTx] = useState<Transaction[]>(() => { try { return JSON.parse(localStorage.getItem('local_transactions') || '[]'); } catch { return []; } });
  const transactions = useMemo(() => {
    const map = new Map<string, Transaction>();
    [...localTx, ...fsClaims, ...fsHistory].forEach(t => map.set(t.id, t));
    return Array.from(map.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [localTx, fsClaims, fsHistory]);
  useEffect(() => { localStorage.setItem('local_transactions', JSON.stringify(localTx.slice(0, 50))); }, [localTx]);

  const displayPoints = useMemo(() => {
    let total = 0;
    transactions.forEach(t => { if (t.type === 'earn') total += t.amount; else if (t.type === 'claim') total -= t.amount; });
    return Math.max(0, total);
  }, [transactions]);

  // ─── Offers ───────────────────────────────────────────────────
  useEffect(() => { const unsub = onOffersChange(); return () => unsub(); }, [onOffersChange]);

  const filteredOffers = useMemo(() => offers.filter(o =>
    offerMatchesCategory(o, selectedCategory) &&
    offerMatchesCountry(o, country) &&
    (!searchQuery || o.brand.toLowerCase().includes(searchQuery.toLowerCase()) || o.description.toLowerCase().includes(searchQuery.toLowerCase()))
  ), [offers, searchQuery, selectedCategory, country]);

  // ─── Banner ───────────────────────────────────────────────────
  useEffect(() => {
    if (isNative && tab === 'offers' && !adRunning) showBanner();
    else if (isNative) hideBanner();
  }, [tab, adRunning, isNative, showBanner, hideBanner]);

  // ─── Web Ad ───────────────────────────────────────────────────
  const showWebAd = useCallback((num: number, total: number): Promise<boolean> =>
    new Promise(resolve => { webRef.current = resolve; setWebNum(num); setWebTotal(total); setWebOpen(true); }), []);
  const onWebDone = useCallback(() => { setWebOpen(false); if (webRef.current) { webRef.current(true); webRef.current = null; } }, []);
  const onWebSkip = useCallback(() => { setWebOpen(false); if (webRef.current) { webRef.current(false); webRef.current = null; } }, []);

  // ─── Watch Ad Flow ────────────────────────────────────────────
  const handleWatchAd = async () => {
    if (adRunning || !user || cdActive) return;
    setAdRunning(true);
    if (isNative) await hideBanner();
    const boostLevel = Number(user.boostLevel) || 1;
    const currentProgress = Number(user.currentLevelAdCounter) || 0;
    const adsNeeded = boostLevel;
    const remaining = adsNeeded - currentProgress;
    if (remaining <= 0) { await handleClaimBoost(); startCooldown(); setAdRunning(false); if (isNative) showBanner(); return; }
    let completed = 0;
    for (let i = 0; i < remaining; i++) {
      const adNum = currentProgress + i + 1;
      const ok = isNative ? await showRewardedAdAndWait() : await showWebAd(adNum, adsNeeded);
      if (!ok) { Toast.show({ text: 'Ad not completed.', duration: 'short' }); break; }
      const result = await recordAdWatch();
      if (result) {
        completed++;
        if (adNum < adsNeeded) { Toast.show({ text: `Ad ${adNum}/${adsNeeded}!`, duration: 'short' }); await new Promise(r => setTimeout(r, 800)); }
      }
    }
    if (completed === remaining) { await handleClaimBoost(); startCooldown(); }
    setAdRunning(false);
    if (isNative && tab === 'offers') showBanner();
  };

  const handleClaimBoost = async () => {
    try { const result = await claimBoostReward(); if (result) Toast.show({ text: '+100 pts!', duration: 'long' }); }
    catch { Toast.show({ text: 'Claim failed.', duration: 'short' }); }
  };

  // ─── Claim Offer ──────────────────────────────────────────────
  const handleClaimOffer = async (offer: Offer, cost: number) => {
    if (!user) return;
    if (user.points < cost) {
      setConfirmCfg({ title: 'Not Enough Points', msg: `Need ${cost - user.points} more.`, fn: handleWatchAd });
      setConfirmOpen(true); return;
    }
    try {
      await firebaseService.claimOffer(user.uid, offer);
      recordUnlock(offer.id);
      if (!offer.code) { Browser.open({ url: offer.url }); }
      else {
        setConfirmCfg({ title: 'Success!', msg: 'Code: ' + offer.code, fn: () => { Clipboard.write({ string: offer.code! }); Toast.show({ text: 'Copied!', duration: 'short' }); } });
        setConfirmOpen(true);
      }
    } catch { Toast.show({ text: 'Failed.', duration: 'long' }); }
  };

  // ─── Auth handlers ────────────────────────────────────────────
  const handleSignIn = async () => {
    setAuthLoading(true);
    try { const u = await firebaseService.signInWithGoogle(); if (u) { setFbUser(u); Toast.show({ text: 'Signed in!', duration: 'short' }); } }
    catch (e: any) { Toast.show({ text: String(e?.message || e).slice(0, 100), duration: 'long' }); }
    finally { setAuthLoading(false); }
  };

  const handleGuest = async () => {
    setAuthLoading(true);
    try { const f = await firebaseService.signInAnonymously(); setFbUser(f); }
    catch {
      let id = localStorage.getItem('persistent_guest_id');
      if (!id) { id = 'local_guest_' + Math.random().toString(36).substr(2, 9); localStorage.setItem('persistent_guest_id', id); }
      setFbUser({ uid: id, isAnonymous: true } as any);
      setUser({ uid: id, email: 'Guest User', points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0 });
    }
    finally { setAuthLoading(false); }
  };

  const handleSignOut = async () => {
    try { await firebaseService.logout(); } catch {}
    setFbUser(null); setUser(null);
  };

  const handleDelete = async () => {
    if (!user) return;
    setAuthLoading(true);
    try {
      await firebaseService.deleteUserProfile(user.uid);
      if (!user.uid.startsWith('local_guest_')) await firebaseService.deleteAccount();
      Toast.show({ text: 'Deleted', duration: 'long' });
    } catch (e: any) {
      Toast.show({ text: e?.code === 'auth/requires-recent-login' ? 'Re-sign in first.' : 'Failed.', duration: 'long' });
    } finally { setFbUser(null); setUser(null); setAuthLoading(false); setDeleteOpen(false); }
  };

  // ─── Screens ─────────────────────────────────────────────────
  if (!isConfigValid) return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
      <AlertCircle size={48} className="text-rose-500 mb-4" />
      <h1 className="text-xl font-bold">Config Error</h1>
    </div>
  );

  if (authLoading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <Logo className="max-w-[80px] animate-pulse" />
    </div>
  );

  if (!fbUser) return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-full max-w-sm flex flex-col items-center">
        <Logo className="max-w-[160px]" />
        <h1 className="text-3xl font-black text-zinc-900 mt-8 mb-3">Welcome to {APP_NAME}</h1>
        <p className="text-sm text-zinc-500 mb-10">Sign in to earn points.</p>
        <div className="w-full space-y-4">
          <button onClick={handleSignIn} className="w-full bg-white border border-zinc-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-sm active:scale-95">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="w-5 h-5" />
            Continue with Google
          </button>
          <button onClick={handleGuest} className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg active:scale-95">
            <User size={20} /> Continue as Guest
          </button>
        </div>
        <p className="mt-12 text-[10px] text-zinc-400 uppercase tracking-widest">v{APP_VERSION}</p>
      </div>
    </div>
  );

  // Use cached/default profile while Firestore loads — no more blank screen
  const displayUser: UserProfile = user || {
    uid: fbUser.uid, email: fbUser.email || '',
    points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0,
    boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: null,
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-50 font-sans overflow-hidden">
      <div className="flex-1 overflow-y-auto scroll-smooth relative">
        <Header user={{ ...displayUser, points: displayPoints }} />
        <main className="max-w-md mx-auto px-6 py-6 pb-[120px]">
          {tab === 'offers' && (
            <HomeScreen
              user={{ ...displayUser, points: displayPoints }}
              offers={offers} isLoading={isLoading}
              searchQuery={searchQuery} setSearchQuery={setSearchQuery}
              selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}
              categories={categories} countries={countries} filteredOffers={filteredOffers}
              transactions={transactions} handleWatchAd={handleWatchAd}
              handleClaimOffer={handleClaimOffer} handleClaimBoostReward={handleClaimBoost}
              isAdRunning={adRunning} selectedCountry={country} setSelectedCountry={onCountryChange}
              isCooldownActive={cdActive} cooldownSecondsLeft={cdSec}
            />
          )}
          {tab === 'profile' && (
            <div className="space-y-6 rh-slide-in">
              <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm text-center">
                <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <User size={40} className="text-indigo-600" />
                </div>
                <h2 className="text-xl font-bold text-zinc-900">{displayUser.email}</h2>
                <p className="text-xs text-zinc-500 mt-1">v{APP_VERSION}</p>
                <div className="grid grid-cols-2 gap-4 mt-8">
                  <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <span className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Points</span>
                    <span className="text-lg font-bold text-zinc-900">{displayPoints}</span>
                  </div>
                  <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <span className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Claims</span>
                    <span className="text-lg font-bold text-zinc-900">{transactions.filter(t => t.type === 'claim').length}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <button onClick={() => setPrivacyOpen(true)} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm">
                  <div className="flex items-center gap-3"><ShieldCheck size={20} className="text-indigo-600" /><span className="text-sm font-bold text-zinc-700">Privacy Policy</span></div>
                  <ChevronRight size={18} className="text-zinc-400" />
                </button>
                <button onClick={handleSignOut} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm">
                  <div className="flex items-center gap-3"><ExternalLink size={20} className="text-zinc-400" /><span className="text-sm font-bold text-zinc-700">Sign Out</span></div>
                  <ChevronRight size={18} className="text-zinc-400" />
                </button>
                <button onClick={() => setDeleteOpen(true)} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-rose-200 shadow-sm">
                  <div className="flex items-center gap-3"><Trash2 size={20} className="text-rose-500" /><span className="text-sm font-bold text-rose-600">Delete Account</span></div>
                  <ChevronRight size={18} className="text-rose-400" />
                </button>
              </div>
              <div className="space-y-3">
                <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">History</h2>
                {transactions.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 border border-dashed border-zinc-200 text-center">
                    <History size={24} className="text-zinc-300 mx-auto mb-2" />
                    <p className="text-xs text-zinc-500">No transactions</p>
                  </div>
                ) : transactions.slice(0, 20).map(tx => (
                  <div key={tx.id} className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', tx.type === 'earn' ? 'bg-emerald-50' : 'bg-indigo-50')}>
                        {tx.type === 'earn' ? <TrendingUp size={16} className="text-emerald-600" /> : <Gift size={16} className="text-indigo-600" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-900">{tx.title}</p>
                        <p className="text-[10px] text-zinc-400">{new Date(tx.timestamp).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={cn('text-sm font-bold', tx.type === 'earn' ? 'text-emerald-600' : 'text-indigo-600')}>
                        {tx.type === 'earn' ? '+' : '-'}{Math.abs(tx.amount)} pts
                      </span>
                      {tx.code && (
                        <button onClick={async () => { await Clipboard.write({ string: tx.code! }); Toast.show({ text: 'Copied!', duration: 'short' }); }}
                          className="block text-[10px] font-mono bg-zinc-100 px-2 py-0.5 rounded text-zinc-600 border border-zinc-200 mt-1">
                          {tx.code}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="h-40" />
              </div>
            </div>
          )}
        </main>
      </div>

      <Navbar tab={tab} setTab={setTab} />
      <WebAdModal isOpen={webOpen} onDone={onWebDone} onSkip={onWebSkip} num={webNum} total={webTotal} />

      {/* Notification permission prompt — user-initiated, replaces auto-timer */}
      <SimpleModal open={showNotifPrompt} close={() => setShowNotifPrompt(false)}>
        <div className="text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Bell size={32} className="text-indigo-600" />
          </div>
          <h3 className="text-xl font-black text-zinc-900 mb-2">Stay Updated!</h3>
          <p className="text-sm text-zinc-500 mb-6">Get notified about new rewards and exclusive offers.</p>
          <button onClick={handleEnableNotifications} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold active:scale-95 mb-3">
            Enable Notifications
          </button>
          <button onClick={() => setShowNotifPrompt(false)} className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold active:scale-95">
            Maybe Later
          </button>
        </div>
      </SimpleModal>

      <SimpleModal open={privacyOpen} close={() => setPrivacyOpen(false)}>
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck size={24} className="text-indigo-600" />
          <h3 className="text-xl font-black text-zinc-900">Privacy Policy</h3>
        </div>
        <div className="text-sm text-zinc-600 space-y-3 max-h-[40vh] overflow-y-auto">
          <p className="font-bold text-zinc-900">Data:</p><p>Email and activity for functionality only.</p>
          <p className="font-bold text-zinc-900">Deletion:</p><p>Delete anytime from Profile.</p>
          <p className="font-bold text-zinc-900">Ads:</p><p>Google AdMob. We never sell your data.</p>
        </div>
        <button onClick={() => setPrivacyOpen(false)} className="w-full mt-6 bg-indigo-600 text-white py-4 rounded-2xl font-bold active:scale-95">Got it</button>
      </SimpleModal>

      <SimpleModal open={deleteOpen} close={() => setDeleteOpen(false)}>
        <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-6"><AlertCircle size={24} className="text-rose-600" /></div>
        <h3 className="text-xl font-black text-zinc-900 mb-2">Delete Account?</h3>
        <p className="text-sm text-zinc-500 mb-6">This is permanent. All data will be lost.</p>
        <button onClick={handleDelete} className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold active:scale-95 mb-3">Delete</button>
        <button onClick={() => setDeleteOpen(false)} className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold active:scale-95">Cancel</button>
      </SimpleModal>

      <SimpleModal open={confirmOpen} close={() => setConfirmOpen(false)}>
        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6"><AlertCircle size={24} className="text-indigo-600" /></div>
        <h3 className="text-xl font-black text-zinc-900 mb-2">{confirmCfg.title}</h3>
        <p className="text-sm text-zinc-500 mb-6">{confirmCfg.msg}</p>
        <button onClick={() => { confirmCfg.fn(); setConfirmOpen(false); }} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold active:scale-95 mb-3">Confirm</button>
        <button onClick={() => setConfirmOpen(false)} className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold active:scale-95">Cancel</button>
      </SimpleModal>
    </div>
  );
}
