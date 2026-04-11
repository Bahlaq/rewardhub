import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, User, LayoutDashboard, PlayCircle, TrendingUp, AlertCircle, X, ChevronRight, Zap, History, Copy, ExternalLink, ShieldCheck, Trash2 } from 'lucide-react';
import { Clipboard } from '@capacitor/clipboard';
import { Toast } from '@capacitor/toast';
import { Browser } from '@capacitor/browser';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Offer, UserProfile, Transaction } from './types';
import { useAds } from './hooks/useAds';
import { firebaseService, FirebaseUser, isConfigValid } from './services/firebase';
import { APP_NAME, APP_VERSION } from './constants';
import { HomeScreen, offerMatchesCountry, recordUnlock } from './components/HomeScreen';
import icon from '../assets/icon.png';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const COOLDOWN_DURATION_MS = 2 * 60 * 1000;
const COOLDOWN_KEY = 'rewardhub_cooldown';

function loadCooldown(): { cooldownStartedAt: number } | null {
  try { const r = localStorage.getItem(COOLDOWN_KEY); if (!r) return null; const p = JSON.parse(r); if (Date.now() - p.cooldownStartedAt >= COOLDOWN_DURATION_MS) { localStorage.removeItem(COOLDOWN_KEY); return null; } return p; } catch { return null; }
}

const Logo = ({ className }: { className?: string }) => (
  <div className={cn("relative w-full mx-auto group cursor-pointer", className)}>
    <img src={icon} alt={`${APP_NAME} Logo`} className="w-full h-auto object-contain rounded-[2.5rem] shadow-2xl transition-transform group-hover:scale-105" referrerPolicy="no-referrer" />
  </div>
);

const Navbar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) => (
  <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-6 pt-3 z-50" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
    <div className="max-w-md mx-auto flex justify-between items-center">
      {[{ id: 'offers', icon: LayoutDashboard, label: 'Rewards' }, { id: 'profile', icon: User, label: 'Profile' }].map(tab => (
        <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex flex-col items-center gap-1", activeTab === tab.id ? "text-indigo-600" : "text-zinc-400")}>
          <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2.5 : 2} /><span className="text-[10px] font-medium uppercase tracking-wider">{tab.label}</span>
        </button>
      ))}
    </div>
  </nav>
);

const Header = ({ user }: { user: UserProfile }) => (
  <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-zinc-100 px-5 pb-2 z-40" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
    <div className="max-w-md mx-auto flex justify-between items-center">
      <div className="flex items-center gap-3"><Logo className="max-w-[36px]" /><div><h1 className="text-base font-black tracking-tight text-zinc-900 leading-none">{APP_NAME}</h1><p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">Earn while you play</p></div></div>
      <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 shadow-sm"><Zap size={14} className="text-indigo-600 fill-indigo-600" /><span className="text-sm font-bold text-indigo-700">{Math.max(0, Number(user.points || 0))} pts</span></div>
    </div>
  </header>
);

const WebAdModal = ({ isOpen, onComplete, onCancel, adNumber, totalAds }: { isOpen: boolean; onComplete: () => void; onCancel: () => void; adNumber: number; totalAds: number }) => {
  const [t, setT] = useState(5); const [done, setDone] = useState(false);
  useEffect(() => { if (!isOpen) return; setT(5); setDone(false); const i = setInterval(() => { setT(p => { if (p <= 1) { clearInterval(i); setDone(true); return 0; } return p - 1; }); }, 1000); return () => clearInterval(i); }, [isOpen]);
  if (!isOpen) return null;
  return (<div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm"><div className="w-full max-w-sm bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl">
    <div className="relative aspect-video bg-zinc-800 flex items-center justify-center"><PlayCircle size={48} className="text-zinc-600 animate-pulse" /><div className="absolute top-4 left-4 bg-indigo-500/80 px-3 py-1 rounded-full text-white text-xs font-bold">Ad {adNumber}/{totalAds}</div><div className="absolute top-4 right-4 bg-black/50 px-3 py-1 rounded-full text-white text-xs font-bold">{done ? 'Done!' : `${t}s`}</div></div>
    <div className="p-6 text-center"><h3 className="text-lg font-bold text-white mb-2">Watching Sponsored Content</h3><p className="text-sm text-zinc-400 mb-6">{done ? 'Tap Continue.' : 'Please wait.'}</p>
    <button onClick={() => { if (done) onComplete(); else onCancel(); }} className={cn("w-full py-3 rounded-2xl font-bold", done ? "bg-emerald-500 text-white" : "bg-zinc-800 text-zinc-500")}>{done ? 'Continue' : 'Skip'}</button></div></div></div>);
};

const SimpleModal = ({ isOpen, onClose, children }: { isOpen: boolean; onClose: () => void; children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (<div className="fixed inset-0 z-[9999] flex items-center justify-center p-6"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" />
    <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"><div className="p-8">{children}</div></motion.div></div>);
};

export default function App() {
  const [activeTab, setActiveTab] = useState('offers');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmCfg, setConfirmCfg] = useState({ title: '', message: '', onConfirm: () => {} });
  const [isAdRunning, setIsAdRunning] = useState(false);
  const [isWebAdOpen, setIsWebAdOpen] = useState(false);
  const [webAdNum, setWebAdNum] = useState(1);
  const [webAdTotal, setWebAdTotal] = useState(1);
  const webAdRef = useRef<((v: boolean) => void) | null>(null);
  const bgTimestampRef = useRef<number>(0);
  const notifReadyRef = useRef(false);

  // Cooldown
  const [isCooldown, setIsCooldown] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);
  const cdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { const s = loadCooldown(); if (s) { const r = COOLDOWN_DURATION_MS - (Date.now() - s.cooldownStartedAt); if (r > 0) { setIsCooldown(true); setCooldownSec(Math.ceil(r / 1000)); startCD(r); } } return () => { if (cdRef.current) clearInterval(cdRef.current); }; }, []);
  function startCD(ms: number) { if (cdRef.current) clearInterval(cdRef.current); const end = Date.now() + ms; setIsCooldown(true); setCooldownSec(Math.ceil(ms / 1000)); cdRef.current = setInterval(() => { const r = end - Date.now(); if (r <= 0) { clearInterval(cdRef.current!); cdRef.current = null; setIsCooldown(false); setCooldownSec(0); localStorage.removeItem(COOLDOWN_KEY); } else setCooldownSec(Math.ceil(r / 1000)); }, 1000); }
  function activateCD(level: number) { localStorage.setItem(COOLDOWN_KEY, JSON.stringify({ cooldownStartedAt: Date.now(), level })); startCD(COOLDOWN_DURATION_MS); }

  // Country
  const [selectedCountry, setSelectedCountry] = useState<string>(() => localStorage.getItem('rewardhub_country') || 'All Countries');
  const handleCountryChange = useCallback((c: string) => { setSelectedCountry(c); localStorage.setItem('rewardhub_country', c); }, []);

  // Auth
  useEffect(() => { const u = firebaseService.onAuthChange(f => { setFirebaseUser(f); if (!f) setIsAuthLoading(false); }); return () => u(); }, []);

  // ═══════════════════════════════════════════════════════════════════
  // COORDINATED STARTUP: Notifications FIRST → Ads AFTER
  // This prevents the crash where App Open Ad and notification
  // permission dialog fight for the native activity stack.
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const uid = firebaseUser.uid;
    let cancelled = false;

    (async () => {
      // Step 1: Init notifications (handles permission dialog)
      try {
        const { notificationService } = await import('./services/notifications');
        await notificationService.initialize((token: string) => {
          firebaseService.saveFcmToken(uid, token);
        });
      } catch {}

      if (cancelled) return;
      notifReadyRef.current = true;

      // Step 2: Show App Open Ad ONLY AFTER notification permission is resolved
      await new Promise(r => setTimeout(r, 1000));
      if (!cancelled) showAppOpenAd(() => notifReadyRef.current);
    })();

    return () => { cancelled = true; };
  }, [firebaseUser?.uid]);

  const [firestoreClaims, setFirestoreClaims] = useState<Transaction[]>([]);
  const [firestoreHistory, setFirestoreHistory] = useState<Transaction[]>([]);
  useEffect(() => {
    if (!firebaseUser?.uid) { setUser(null); setFirestoreClaims([]); setFirestoreHistory([]); return; }
    const uid = firebaseUser.uid; setIsAuthLoading(true);
    firebaseService.checkDailyReset(uid);
    const u1 = firebaseService.onProfileChange(uid, p => { if (p) setUser(p); else firebaseService.saveUserProfile({ uid, email: firebaseUser.email || (uid.startsWith('local_guest_') ? 'Guest User' : 'Unknown'), points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0, boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: new Date().toDateString() }); setIsAuthLoading(false); });
    const u2 = firebaseService.onClaimsChange(uid, setFirestoreClaims);
    const u3 = firebaseService.onHistoryChange(uid, setFirestoreHistory);
    return () => { u1(); u2(); u3(); };
  }, [firebaseUser?.uid]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const categories = ['all', 'Fashion', 'Delivery apps', 'Shopping', 'Travel', 'Food', 'General', 'Entertainment', 'Tech'];
  const [localTx, setLocalTx] = useState<Transaction[]>(() => { const s = localStorage.getItem('local_transactions'); return s ? JSON.parse(s) : []; });
  const transactions = useMemo(() => Array.from(new Map([...localTx, ...firestoreClaims, ...firestoreHistory].map(t => [t.id, t])).values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [localTx, firestoreClaims, firestoreHistory]);
  useEffect(() => { localStorage.setItem('local_transactions', JSON.stringify(localTx.slice(0, 50))); }, [localTx]);
  const displayPoints = useMemo(() => Math.max(0, transactions.reduce((a, t) => t.type === 'earn' ? a + t.amount : t.type === 'claim' ? a - t.amount : a, 0)), [transactions]);

  const { offers, isLoading, onOffersChange, showRewardedAdAndWait, recordAdWatch, claimBoostReward, showBanner, hideBanner, showAppOpenAd, isNative } = useAds(firebaseUser?.uid);
  useEffect(() => { const u = onOffersChange(); return () => u(); }, [onOffersChange]);

  // Filter: category → country → search
  const filteredOffers = useMemo(() => offers.filter(o => {
    const sel = selectedCategory.toLowerCase();
    const cats = Array.isArray(o.category) ? o.category.map(c => String(c).toLowerCase()) : [String(o.category || '').toLowerCase()];
    if (sel !== 'all' && !cats.includes(sel)) return false;
    if (!offerMatchesCountry(o, selectedCountry)) return false;
    const s = searchQuery.toLowerCase();
    return o.brand.toLowerCase().includes(s) || o.description.toLowerCase().includes(s);
  }), [offers, searchQuery, selectedCategory, selectedCountry]);

  // Resume ad
  useEffect(() => {
    const h = () => {
      if (document.visibilityState === 'hidden') bgTimestampRef.current = Date.now();
      else if (document.visibilityState === 'visible' && bgTimestampRef.current > 0 && Date.now() - bgTimestampRef.current >= 5000) showAppOpenAd(() => notifReadyRef.current);
    };
    document.addEventListener('visibilitychange', h); return () => document.removeEventListener('visibilitychange', h);
  }, [showAppOpenAd]);

  useEffect(() => { if (isNative && activeTab === 'offers' && !isAdRunning) showBanner(); else if (isNative) hideBanner(); }, [activeTab, isAdRunning, isNative, showBanner, hideBanner]);

  const showWebAd = useCallback((n: number, t: number): Promise<boolean> => new Promise(r => { webAdRef.current = r; setWebAdNum(n); setWebAdTotal(t); setIsWebAdOpen(true); }), []);
  const onWebComplete = useCallback(() => { setIsWebAdOpen(false); webAdRef.current?.(true); webAdRef.current = null; }, []);
  const onWebCancel = useCallback(() => { setIsWebAdOpen(false); webAdRef.current?.(false); webAdRef.current = null; }, []);

  const handleWatchAd = async () => {
    if (isAdRunning || !user || isCooldown) return;
    setIsAdRunning(true); if (isNative) await hideBanner();
    const bl = Number(user.boostLevel) || 1, cp = Number(user.currentLevelAdCounter) || 0, rem = bl - cp;
    if (rem <= 0) { await handleClaim(); activateCD(bl); setIsAdRunning(false); if (isNative) showBanner(); return; }
    let done = 0;
    for (let i = 0; i < rem; i++) {
      const n = cp + i + 1;
      const ok = isNative ? await showRewardedAdAndWait() : await showWebAd(n, bl);
      if (!ok) { Toast.show({ text: 'Ad not completed.', duration: 'short' }); break; }
      const r = await recordAdWatch(); if (r) { done++; if (n < bl) { Toast.show({ text: `Ad ${n}/${bl} done!`, duration: 'short' }); await new Promise(r => setTimeout(r, 800)); } }
    }
    if (done === rem) { await handleClaim(); activateCD(bl); }
    setIsAdRunning(false); if (isNative && activeTab === 'offers') showBanner();
  };

  const handleClaim = async () => { try { const r = await claimBoostReward(); if (r) Toast.show({ text: 'Boost Complete! +100 pts', duration: 'long' }); } catch { Toast.show({ text: "Claim failed.", duration: 'short' }); } };

  const handleClaimOffer = async (offer: Offer, cost: number) => {
    if (!user) return;
    if (user.points < cost) { setConfirmCfg({ title: 'Not Enough Points', message: `Need ${cost - user.points} more pts.`, onConfirm: handleWatchAd }); setIsConfirmOpen(true); return; }
    try {
      await firebaseService.claimOffer(user.uid, offer);
      recordUnlock(offer.id); // Track 48hr expiration
      if (!offer.code) Browser.open({ url: offer.url });
      else { setConfirmCfg({ title: 'Success!', message: `Code: ${offer.code}`, onConfirm: () => { Clipboard.write({ string: offer.code! }); Toast.show({ text: 'Copied!', duration: 'short' }); } }); setIsConfirmOpen(true); }
    } catch { Toast.show({ text: "Claim failed.", duration: 'long' }); }
  };

  const handleSignIn = async () => { setIsAuthLoading(true); try { const u = await firebaseService.signInWithGoogle(); if (u) { setFirebaseUser(u); Toast.show({ text: "Signed in!", duration: 'short' }); } } catch (e) { Toast.show({ text: (e instanceof Error ? e.message : String(e)).slice(0, 100), duration: 'long' }); } finally { setIsAuthLoading(false); } };
  const handleGuest = async () => { setIsAuthLoading(true); try { const f = await firebaseService.signInAnonymously(); setFirebaseUser(f); } catch { let id = localStorage.getItem('persistent_guest_id'); if (!id) { id = 'local_guest_' + Math.random().toString(36).substr(2, 9); localStorage.setItem('persistent_guest_id', id); } setFirebaseUser({ uid: id, isAnonymous: true } as any); setUser({ uid: id, email: 'Guest User', points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0 }); } finally { setIsAuthLoading(false); } };
  const handleSignOut = async () => { try { await firebaseService.logout(); } catch {} finally { setFirebaseUser(null); setUser(null); } };
  const handleDelete = async () => { if (!user) return; setIsAuthLoading(true); try { await firebaseService.deleteUserProfile(user.uid); if (!user.uid.startsWith('local_guest_')) await firebaseService.deleteAccount(); Toast.show({ text: 'Deleted', duration: 'long' }); } catch (e: any) { Toast.show({ text: e.code === 'auth/requires-recent-login' ? "Re-sign in first." : "Failed.", duration: 'long' }); } finally { setFirebaseUser(null); setUser(null); setIsAuthLoading(false); setIsDeleteOpen(false); } };

  if (!isConfigValid) return (<div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center"><AlertCircle size={48} className="text-rose-500 mb-4" /><h1 className="text-xl font-bold">Config Error</h1></div>);
  if (isAuthLoading) return (<div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center gap-6"><Logo className="max-w-[120px]" /><div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>);
  if (!firebaseUser) return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-full max-w-sm flex flex-col items-center"><Logo className="max-w-[160px]" /><h1 className="text-3xl font-black text-zinc-900 mt-8 mb-3">Welcome to {APP_NAME}</h1><p className="text-sm text-zinc-500 mb-10">Sign in to start earning points.</p>
        <div className="w-full space-y-4">
          <button onClick={handleSignIn} className="w-full bg-white border border-zinc-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-sm active:scale-95"><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="w-5 h-5" /> Continue with Google</button>
          <button onClick={handleGuest} className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg active:scale-95"><User size={20} /> Continue as Guest</button>
        </div><p className="mt-12 text-[10px] text-zinc-400 uppercase tracking-widest">v{APP_VERSION}</p></div></div>
  );
  if (!user) return (<div className="h-screen flex flex-col items-center justify-center bg-zinc-50"><div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" /></div>);

  return (
    <div className="h-screen flex flex-col bg-zinc-50 font-sans overflow-hidden">
      <div className="flex-1 overflow-y-auto scroll-smooth relative">
        <Header user={{ ...user, points: displayPoints }} />
        <main className="max-w-md mx-auto px-6 py-6 pb-[120px]">
          <AnimatePresence mode="wait">
            {activeTab === 'offers' && (
              <HomeScreen user={{ ...user, points: displayPoints }} offers={offers} isLoading={isLoading} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} categories={categories}
                filteredOffers={filteredOffers} transactions={transactions} handleWatchAd={handleWatchAd}
                handleClaimOffer={handleClaimOffer} handleClaimBoostReward={handleClaim} isAdRunning={isAdRunning}
                selectedCountry={selectedCountry} setSelectedCountry={handleCountryChange}
                isCooldownActive={isCooldown} cooldownSecondsLeft={cooldownSec} />
            )}
            {activeTab === 'profile' && (
              <motion.div key="profile" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm text-center">
                  <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4"><User size={40} className="text-indigo-600" /></div>
                  <h2 className="text-xl font-bold text-zinc-900">{user.email}</h2><p className="text-xs text-zinc-500 mt-1">v{APP_VERSION}</p>
                  <div className="grid grid-cols-2 gap-4 mt-8">
                    <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100"><span className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Points</span><span className="text-lg font-bold text-zinc-900">{displayPoints}</span></div>
                    <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100"><span className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Claims</span><span className="text-lg font-bold text-zinc-900">{transactions.filter(t => t.type === 'claim').length}</span></div>
                  </div>
                </div>
                <div className="space-y-3">
                  <button onClick={() => setIsPrivacyOpen(true)} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm"><div className="flex items-center gap-3"><ShieldCheck size={20} className="text-indigo-600" /><span className="text-sm font-bold text-zinc-700">Privacy Policy</span></div><ChevronRight size={18} className="text-zinc-400" /></button>
                  <button onClick={handleSignOut} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm"><div className="flex items-center gap-3"><ExternalLink size={20} className="text-zinc-400" /><span className="text-sm font-bold text-zinc-700">Sign Out</span></div><ChevronRight size={18} className="text-zinc-400" /></button>
                  <button onClick={() => setIsDeleteOpen(true)} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-rose-200 shadow-sm"><div className="flex items-center gap-3"><Trash2 size={20} className="text-rose-500" /><span className="text-sm font-bold text-rose-600">Delete Account</span></div><ChevronRight size={18} className="text-rose-400" /></button>
                </div>
                <div className="space-y-3"><h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">History</h2>
                  {transactions.length === 0 ? <div className="bg-white rounded-2xl p-8 border border-dashed border-zinc-200 text-center"><History size={24} className="text-zinc-300 mx-auto mb-2" /><p className="text-xs text-zinc-500">No transactions</p></div>
                  : transactions.slice(0, 20).map(tx => (
                    <div key={tx.id} className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm flex justify-between items-center">
                      <div className="flex items-center gap-3"><div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", tx.type === 'earn' ? "bg-emerald-50" : "bg-indigo-50")}>{tx.type === 'earn' ? <TrendingUp size={16} className="text-emerald-600" /> : <Gift size={16} className="text-indigo-600" />}</div>
                      <div><p className="text-xs font-bold text-zinc-900">{tx.title}</p><p className="text-[10px] text-zinc-400">{new Date(tx.timestamp).toLocaleDateString()}</p></div></div>
                      <div className="text-right"><span className={cn("text-sm font-bold", tx.type === 'earn' ? "text-emerald-600" : "text-indigo-600")}>{tx.type === 'earn' ? '+' : '-'}{Math.abs(tx.amount)} pts</span>
                      {tx.code && <button onClick={async () => { await Clipboard.write({ string: tx.code! }); Toast.show({ text: 'Copied!', duration: 'short' }); }} className="text-[10px] font-mono bg-zinc-100 px-2 py-0.5 rounded text-zinc-600 border border-zinc-200">{tx.code}<Copy size={10} /></button>}</div>
                    </div>))}<div className="h-40" /></div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <WebAdModal isOpen={isWebAdOpen} onComplete={onWebComplete} onCancel={onWebCancel} adNumber={webAdNum} totalAds={webAdTotal} />
      <SimpleModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)}>
        <div className="flex items-center gap-3 mb-6"><ShieldCheck size={24} className="text-indigo-600" /><h3 className="text-xl font-black text-zinc-900">Privacy Policy</h3></div>
        <div className="text-sm text-zinc-600 space-y-3 max-h-[40vh] overflow-y-auto"><p className="font-bold text-zinc-900">Data:</p><p>We collect your email and in-app activity for functionality only.</p><p className="font-bold text-zinc-900">Deletion:</p><p>Delete anytime from Profile.</p><p className="font-bold text-zinc-900">Ads:</p><p>We use Google AdMob. We never sell your data.</p></div>
        <button onClick={() => setIsPrivacyOpen(false)} className="w-full mt-6 bg-indigo-600 text-white py-4 rounded-2xl font-bold active:scale-95">Got it</button>
      </SimpleModal>
      <SimpleModal isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)}>
        <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-6"><AlertCircle size={24} className="text-rose-600" /></div>
        <h3 className="text-xl font-black text-zinc-900 mb-2">Delete Account?</h3><p className="text-sm text-zinc-500 mb-8">Permanent. All data lost.</p>
        <div className="flex flex-col gap-3"><button onClick={handleDelete} className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold active:scale-95">Delete</button><button onClick={() => setIsDeleteOpen(false)} className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold active:scale-95">Cancel</button></div>
      </SimpleModal>
      <SimpleModal isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)}>
        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6"><AlertCircle size={24} className="text-indigo-600" /></div>
        <h3 className="text-xl font-black text-zinc-900 mb-2">{confirmCfg.title}</h3><p className="text-sm text-zinc-500 mb-8">{confirmCfg.message}</p>
        <div className="flex flex-col gap-3"><button onClick={() => { confirmCfg.onConfirm(); setIsConfirmOpen(false); }} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold active:scale-95">Confirm</button><button onClick={() => setIsConfirmOpen(false)} className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold active:scale-95">Cancel</button></div>
      </SimpleModal>
    </div>
  );
}
