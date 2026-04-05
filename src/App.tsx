import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Gift, User, LayoutDashboard, PlayCircle, TrendingUp, Clock, CheckCircle2, AlertCircle,
  X, ChevronRight, Zap, History, Copy, ExternalLink, ShieldCheck, Trash2, Terminal
} from 'lucide-react';
import { Clipboard } from '@capacitor/clipboard';
import { Toast } from '@capacitor/toast';
import { Browser } from '@capacitor/browser';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Offer, UserProfile, Transaction } from './types';
import { useAds } from './hooks/useAds';
import { firebaseService, FirebaseUser, isConfigValid } from './services/firebase';
import { APP_NAME, APP_VERSION } from './constants';
import { HomeScreen } from './components/HomeScreen';
import icon from '../assets/icon.png';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const Logo = ({ className }: { className?: string }) => (
  <div className={cn("relative w-full mx-auto group cursor-pointer", className)}>
    <img src={icon} alt={`${APP_NAME} Logo`} className="w-full h-auto object-contain rounded-[2.5rem] shadow-2xl transition-transform group-hover:scale-105" referrerPolicy="no-referrer" />
  </div>
);

const Navbar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) => (
  <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-6 pt-3 z-50" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
    <div className="max-w-md mx-auto flex justify-between items-center">
      {[{ id: 'offers', icon: LayoutDashboard, label: 'Rewards' }, { id: 'profile', icon: User, label: 'Profile' }].map(tab => (
        <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === tab.id ? "text-indigo-600" : "text-zinc-400 hover:text-zinc-600")}>
          <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
          <span className="text-[10px] font-medium uppercase tracking-wider">{tab.label}</span>
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

// Web Ad Simulator — z-[9999], shows "Ad X of Y"
const WebAdSimulatorModal = ({ isOpen, onComplete, onCancel, adNumber, totalAds }: {
  isOpen: boolean; onComplete: () => void; onCancel: () => void; adNumber: number; totalAds: number;
}) => {
  const [timeLeft, setTimeLeft] = useState(5);
  const [isFinished, setIsFinished] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setTimeLeft(5); setIsFinished(false);
    const timer = setInterval(() => { setTimeLeft(p => { if (p <= 1) { clearInterval(timer); setIsFinished(true); return 0; } return p - 1; }); }, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
      <div className="w-full max-w-sm bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl">
        <div className="relative aspect-video bg-zinc-800 flex items-center justify-center">
          <PlayCircle size={48} className="text-zinc-600 animate-pulse" />
          <div className="absolute top-4 left-4 bg-indigo-500/80 px-3 py-1 rounded-full text-white text-xs font-bold">Ad {adNumber} of {totalAds}</div>
          <div className="absolute top-4 right-4 bg-black/50 px-3 py-1 rounded-full text-white text-xs font-bold">{isFinished ? 'Done!' : `${timeLeft}s`}</div>
        </div>
        <div className="p-6 text-center">
          <h3 className="text-lg font-bold text-white mb-2">Watching Sponsored Content</h3>
          <p className="text-sm text-zinc-400 mb-6">{isFinished ? 'Ad complete. Tap Continue.' : 'Please wait for the ad to finish.'}</p>
          <button onClick={() => { if (isFinished) onComplete(); else onCancel(); }}
            className={cn("w-full py-3 rounded-2xl font-bold transition-all", isFinished ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-zinc-800 text-zinc-500")}>
            {isFinished ? 'Continue' : 'Skip (no reward)'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DebugLogsModal = ({ isOpen, onClose, logs }: { isOpen: boolean; onClose: () => void; logs: any[] }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center"><h3 className="text-lg font-bold text-white">Debug Logs</h3><button onClick={onClose} className="p-2 text-zinc-400 hover:text-white"><X size={20} /></button></div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[10px]">
          {logs.length === 0 ? <p className="text-zinc-500 text-center py-8">No logs.</p>
          : logs.map((l: any) => (<div key={l.id} className={cn("p-2 rounded-lg border", l.event === 'error' ? "bg-rose-900/20 border-rose-800 text-rose-400" : l.event === 'reward' ? "bg-emerald-900/20 border-emerald-800 text-emerald-400" : "bg-zinc-800/50 border-zinc-700 text-zinc-300")}>
            <span className="text-zinc-500">{new Date(l.timestamp).toLocaleTimeString()}</span> <span className="font-bold uppercase">[{l.type}:{l.event}]</span> {l.message}
          </div>))}
        </div>
      </div>
    </div>
  );
};

const SimpleModal = ({ isOpen, onClose, children }: { isOpen: boolean; onClose: () => void; children: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"><div className="p-8">{children}</div></motion.div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('offers');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: '', message: '', onConfirm: () => {} });
  const [isAdRunning, setIsAdRunning] = useState(false);
  const [isWebAdModalOpen, setIsWebAdModalOpen] = useState(false);
  const [webAdNumber, setWebAdNumber] = useState(1);
  const [webAdTotal, setWebAdTotal] = useState(1);
  const webAdResolveRef = useRef<((v: boolean) => void) | null>(null);

  useEffect(() => { const u = firebaseService.onAuthChange(f => { setFirebaseUser(f); if (!f) setIsAuthLoading(false); }); return () => u(); }, []);

  const [firestoreClaims, setFirestoreClaims] = useState<Transaction[]>([]);
  const [firestoreHistory, setFirestoreHistory] = useState<Transaction[]>([]);

  useEffect(() => {
    if (!firebaseUser?.uid) { setUser(null); setFirestoreClaims([]); setFirestoreHistory([]); return; }
    const uid = firebaseUser.uid;
    setIsAuthLoading(true);
    if (uid.startsWith('local_guest_') || firebaseUser) firebaseService.checkDailyReset(uid);
    const u1 = firebaseService.onProfileChange(uid, p => {
      if (p) setUser(p);
      else firebaseService.saveUserProfile({ uid, email: firebaseUser.email || (uid.startsWith('local_guest_') ? 'Guest User' : 'Unknown'), points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0, boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: new Date().toDateString() });
      setIsAuthLoading(false);
    });
    const u2 = firebaseService.onClaimsChange(uid, setFirestoreClaims);
    const u3 = firebaseService.onHistoryChange(uid, setFirestoreHistory);
    return () => { u1(); u2(); u3(); };
  }, [firebaseUser?.uid]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const categories = ['all', 'Fashion', 'Delivery apps', 'Shopping', 'Travel', 'Food', 'General'];
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>(() => { const s = localStorage.getItem('local_transactions'); return s ? JSON.parse(s) : []; });
  const transactions = useMemo(() => Array.from(new Map([...localTransactions, ...firestoreClaims, ...firestoreHistory].map(t => [t.id, t])).values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [localTransactions, firestoreClaims, firestoreHistory]);
  useEffect(() => { localStorage.setItem('local_transactions', JSON.stringify(localTransactions.slice(0, 50))); }, [localTransactions]);

  const { logs, addLog, offers, isLoading, onOffersChange, showRewardedAdAndWait, recordAdWatch, claimBoostReward, showBanner, hideBanner, showAppOpenAd, isNative } = useAds(firebaseUser?.uid);
  useEffect(() => { const u = onOffersChange(); return () => u(); }, [onOffersChange]);
  const filteredOffers = useMemo(() => offers.filter(o => { const s = selectedCategory.toLowerCase(); const mc = s === 'all' || (Array.isArray(o.category) ? o.category.some(c => String(c).toLowerCase() === s) : String(o.category || '').toLowerCase() === s); return mc && (o.brand.toLowerCase().includes(searchQuery.toLowerCase()) || o.description.toLowerCase().includes(searchQuery.toLowerCase())); }), [offers, searchQuery, selectedCategory]);
  const displayPoints = useMemo(() => Math.max(0, transactions.reduce((a, t) => t.type === 'earn' ? a + t.amount : t.type === 'claim' ? a - t.amount : a, 0)), [transactions]);

  useEffect(() => { const t = setTimeout(() => showAppOpenAd(), 1500); return () => clearTimeout(t); }, [showAppOpenAd]);
  // Native banner lifecycle
  useEffect(() => { if (isNative && activeTab === 'offers' && !isAdRunning) showBanner(); else if (isNative) hideBanner(); }, [activeTab, isAdRunning, isNative, showBanner, hideBanner]);

  const showWebSimulatorAndWait = useCallback((num: number, total: number): Promise<boolean> => {
    return new Promise(resolve => { webAdResolveRef.current = resolve; setWebAdNumber(num); setWebAdTotal(total); setIsWebAdModalOpen(true); });
  }, []);
  const handleWebAdComplete = useCallback(() => { setIsWebAdModalOpen(false); webAdResolveRef.current?.(true); webAdResolveRef.current = null; }, []);
  const handleWebAdCancel = useCallback(() => { setIsWebAdModalOpen(false); webAdResolveRef.current?.(false); webAdResolveRef.current = null; }, []);

  // Main ad flow
  const handleWatchAd = async () => {
    if (isAdRunning || !user) return;
    setIsAdRunning(true);
    if (isNative) await hideBanner();
    const boostLevel = Number(user.boostLevel) || 1;
    const currentProgress = Number(user.currentLevelAdCounter) || 0;
    const adsNeeded = boostLevel;
    const remaining = adsNeeded - currentProgress;
    if (remaining <= 0) { await handleClaimBoostReward(); setIsAdRunning(false); if (isNative && activeTab === 'offers') showBanner(); return; }

    let completed = 0;
    for (let i = 0; i < remaining; i++) {
      const adNum = currentProgress + i + 1;
      let ok: boolean;
      if (isNative) { ok = await showRewardedAdAndWait(); }
      else { ok = await showWebSimulatorAndWait(adNum, adsNeeded); }
      if (!ok) { Toast.show({ text: 'Ad not completed.', duration: 'short' }); break; }
      const r = await recordAdWatch();
      if (r) { completed++; if (adNum < adsNeeded) { Toast.show({ text: `Ad ${adNum}/${adsNeeded} done!`, duration: 'short' }); await new Promise(r => setTimeout(r, 800)); } }
    }
    if (completed === remaining) await handleClaimBoostReward();
    setIsAdRunning(false);
    if (isNative && activeTab === 'offers') showBanner();
  };

  const handleClaimBoostReward = async () => {
    try { const r = await claimBoostReward(); if (r) Toast.show({ text: `Boost Complete! +100 pts`, duration: 'long' }); }
    catch { Toast.show({ text: "Claim failed.", duration: 'short' }); }
  };

  const handleClaimOffer = async (offer: Offer, cost: number) => {
    if (!user) return;
    if (user.points < cost) { setConfirmConfig({ title: 'Not Enough Points', message: `Need ${cost - user.points} more pts.`, onConfirm: handleWatchAd }); setIsConfirmModalOpen(true); return; }
    try { await firebaseService.claimOffer(user.uid, offer); if (!offer.code) Browser.open({ url: offer.url }); else { setConfirmConfig({ title: 'Success!', message: `Code: ${offer.code}`, onConfirm: () => { Clipboard.write({ string: offer.code! }); Toast.show({ text: 'Copied!', duration: 'short' }); } }); setIsConfirmModalOpen(true); } }
    catch { Toast.show({ text: "Claim failed.", duration: 'long' }); }
  };

  const handleSignIn = async () => {
    setIsAuthLoading(true);
    try {
      // firebase.ts now has timeout + web popup fallback — will never hang forever
      const u = await firebaseService.signInWithGoogle();
      if (u) { setFirebaseUser(u); Toast.show({ text: "Signed in!", duration: 'short' }); }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      addLog('app_open', 'error', m);
      Toast.show({ text: `Sign-In failed: ${m.slice(0, 80)}`, duration: 'long' });
    } finally { setIsAuthLoading(false); }
  };

  const handleGuestSignIn = async () => {
    setIsAuthLoading(true);
    try { const f = await firebaseService.signInAnonymously(); setFirebaseUser(f); }
    catch { let id = localStorage.getItem('persistent_guest_id'); if (!id) { id = 'local_guest_' + Math.random().toString(36).substr(2, 9); localStorage.setItem('persistent_guest_id', id); } setFirebaseUser({ uid: id, isAnonymous: true } as any); setUser({ uid: id, email: 'Guest User', points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0 }); }
    finally { setIsAuthLoading(false); }
  };

  const handleSignOut = async () => { try { await firebaseService.logout(); } catch {} finally { setFirebaseUser(null); setUser(null); } };
  const handleDeleteAccount = async () => {
    if (!user) return; setIsAuthLoading(true);
    try { await firebaseService.deleteUserProfile(user.uid); if (!user.uid.startsWith('local_guest_')) await firebaseService.deleteAccount(); Toast.show({ text: 'Deleted', duration: 'long' }); }
    catch (e: any) { Toast.show({ text: e.code === 'auth/requires-recent-login' ? "Re-sign in first." : "Failed.", duration: 'long' }); }
    finally { setFirebaseUser(null); setUser(null); setIsAuthLoading(false); setIsDeleteModalOpen(false); }
  };

  if (!isConfigValid) return (<div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center"><AlertCircle size={48} className="text-rose-500 mb-4" /><h1 className="text-xl font-bold text-zinc-900 mb-2">Config Error</h1></div>);

  const renderMain = () => {
    if (isAuthLoading) return (<div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center gap-6" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}><Logo className="max-w-[120px]" /><div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>);
    if (!firebaseUser) return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-8 text-center" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="w-full max-w-sm flex flex-col items-center">
          <Logo className="max-w-[160px]" /><h1 className="text-3xl font-black tracking-tight text-zinc-900 mt-8 mb-3">Welcome to RewardHub</h1><p className="text-sm text-zinc-500 mb-10 max-w-[280px]">Sign in to start earning.</p>
          <div className="w-full space-y-4">
            <button onClick={handleSignIn} disabled={isAuthLoading} className="w-full bg-white border border-zinc-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-sm hover:shadow-md transition-all active:scale-95 disabled:opacity-70">
              {isAuthLoading ? <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" /> : <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="w-5 h-5" />}
              {isAuthLoading ? 'Signing in...' : 'Continue with Google'}
            </button>
            <button onClick={handleGuestSignIn} className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg hover:bg-zinc-800 transition-all active:scale-95"><User size={20} /> Continue as Guest</button>
          </div>
          <p className="mt-12 text-[10px] text-zinc-400 font-medium uppercase tracking-widest">v{APP_VERSION}</p>
          <button onClick={() => setIsDebugModalOpen(true)} className="mt-4 flex items-center gap-2 text-[10px] font-bold text-zinc-300 uppercase tracking-wider hover:text-zinc-500"><Terminal size={12} /> Debugger</button>
        </div>
      </div>
    );
    if (!user) return (<div className="h-screen flex flex-col items-center justify-center bg-zinc-50 p-6"><div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" /><p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Loading...</p></div>);

    return (
      <div className="h-screen flex flex-col bg-zinc-50 font-sans selection:bg-indigo-100 overflow-hidden">
        <div className="flex-1 overflow-y-auto scroll-smooth relative">
          <Header user={{ ...user, points: Number(displayPoints || 0) }} />
          <main className="max-w-md mx-auto px-6 py-6 pb-[120px]">
            <AnimatePresence mode="wait">
              {activeTab === 'offers' && (
                <HomeScreen user={{ ...user, points: Number(displayPoints || 0) }} offers={offers} isLoading={isLoading} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
                  selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} categories={categories}
                  filteredOffers={filteredOffers} transactions={transactions} handleWatchAd={handleWatchAd}
                  handleClaimOffer={handleClaimOffer} handleClaimBoostReward={handleClaimBoostReward} isAdRunning={isAdRunning} />
              )}
              {activeTab === 'profile' && (
                <motion.div key="profile" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-6">
                  <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm text-center">
                    <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4"><User size={40} className="text-indigo-600" /></div>
                    <h2 className="text-xl font-bold text-zinc-900">{user.email}</h2><p className="text-xs text-zinc-500">v{APP_VERSION}</p>
                    <div className="grid grid-cols-2 gap-4 mt-8">
                      <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100"><span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">Points</span><span className="text-lg font-bold text-zinc-900">{displayPoints}</span></div>
                      <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100"><span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">Claims</span><span className="text-lg font-bold text-zinc-900">{transactions.filter(t => t.type === 'claim').length}</span></div>
                    </div>
                    <div className="mt-6 pt-6 border-t border-zinc-100">
                      <button onClick={() => setIsDebugModalOpen(true)} className="w-full flex items-center justify-between p-4 bg-zinc-50 rounded-2xl text-left hover:bg-zinc-100"><div className="flex items-center gap-3"><Terminal size={18} className="text-zinc-400" /><span className="text-sm font-bold text-zinc-700">Debugger</span></div><ChevronRight size={18} className="text-zinc-400" /></button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <button onClick={() => setIsPrivacyModalOpen(true)} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm hover:bg-zinc-50"><div className="flex items-center gap-3"><ShieldCheck size={20} className="text-indigo-600" /><span className="text-sm font-bold text-zinc-700">Privacy Policy</span></div><ChevronRight size={18} className="text-zinc-400" /></button>
                    <button onClick={handleSignOut} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm hover:bg-zinc-50"><div className="flex items-center gap-3"><ExternalLink size={20} className="text-zinc-400" /><span className="text-sm font-bold text-zinc-700">Sign Out</span></div><ChevronRight size={18} className="text-zinc-400" /></button>
                    <button onClick={() => setIsDeleteModalOpen(true)} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-rose-200 shadow-sm hover:bg-rose-50"><div className="flex items-center gap-3"><Trash2 size={20} className="text-rose-500" /><span className="text-sm font-bold text-rose-600">Delete Account</span></div><ChevronRight size={18} className="text-rose-400" /></button>
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">History</h2>
                    {transactions.length === 0 ? <div className="bg-white rounded-2xl p-8 border border-dashed border-zinc-200 text-center"><History size={24} className="text-zinc-300 mx-auto mb-2" /><p className="text-xs text-zinc-500">No transactions</p></div>
                    : transactions.slice(0, 20).map(tx => (
                      <div key={tx.id} className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm flex justify-between items-center">
                        <div className="flex items-center gap-3"><div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", tx.type === 'earn' ? "bg-emerald-50" : "bg-indigo-50")}>{tx.type === 'earn' ? <TrendingUp size={16} className="text-emerald-600" /> : <Gift size={16} className="text-indigo-600" />}</div>
                        <div><p className="text-xs font-bold text-zinc-900">{tx.title}</p><p className="text-[10px] text-zinc-400">{new Date(tx.timestamp).toLocaleDateString()}</p></div></div>
                        <div className="text-right"><span className={cn("text-sm font-bold", tx.type === 'earn' ? "text-emerald-600" : "text-indigo-600")}>{tx.type === 'earn' ? '+' : '-'}{Math.abs(tx.amount)} pts</span>
                        {tx.code && <button onClick={async () => { await Clipboard.write({ string: tx.code! }); Toast.show({ text: 'Copied!', duration: 'short' }); }} className="flex items-center gap-1 text-[10px] font-mono bg-zinc-100 px-2 py-0.5 rounded text-zinc-600 border border-zinc-200 hover:bg-zinc-200">{tx.code}<Copy size={10} /></button>}</div>
                      </div>
                    ))}
                    <div className="h-40" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
        <WebAdSimulatorModal isOpen={isWebAdModalOpen} onComplete={handleWebAdComplete} onCancel={handleWebAdCancel} adNumber={webAdNumber} totalAds={webAdTotal} />
        <SimpleModal isOpen={isPrivacyModalOpen} onClose={() => setIsPrivacyModalOpen(false)}>
          <div className="flex items-center gap-3 mb-6"><ShieldCheck size={24} className="text-indigo-600" /><h3 className="text-xl font-black text-zinc-900">Privacy Policy</h3></div>
          <div className="text-sm text-zinc-600 space-y-3 max-h-[40vh] overflow-y-auto"><p className="font-bold text-zinc-900">Data Collection:</p><p>We collect your email and in-app activity.</p><p className="font-bold text-zinc-900">Data Deletion:</p><p>Delete your account anytime via Settings.</p><p className="font-bold text-zinc-900">Third Parties:</p><p>We use Google AdMob. We never sell your data.</p></div>
          <button onClick={() => setIsPrivacyModalOpen(false)} className="w-full mt-6 bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 active:scale-95">Got it</button>
        </SimpleModal>
        <SimpleModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)}>
          <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-6"><AlertCircle size={24} className="text-rose-600" /></div>
          <h3 className="text-xl font-black text-zinc-900 mb-2">Delete Account?</h3><p className="text-sm text-zinc-500 mb-8">Permanent. All data lost.</p>
          <div className="flex flex-col gap-3"><button onClick={handleDeleteAccount} className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold hover:bg-rose-700 active:scale-95">Yes, Delete</button><button onClick={() => setIsDeleteModalOpen(false)} className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold hover:bg-zinc-200 active:scale-95">Cancel</button></div>
        </SimpleModal>
        <SimpleModal isOpen={isConfirmModalOpen} onClose={() => setIsConfirmModalOpen(false)}>
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6"><AlertCircle size={24} className="text-indigo-600" /></div>
          <h3 className="text-xl font-black text-zinc-900 mb-2">{confirmConfig.title}</h3><p className="text-sm text-zinc-500 mb-8">{confirmConfig.message}</p>
          <div className="flex flex-col gap-3"><button onClick={() => { confirmConfig.onConfirm(); setIsConfirmModalOpen(false); }} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 active:scale-95">Confirm</button><button onClick={() => setIsConfirmModalOpen(false)} className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold hover:bg-zinc-200 active:scale-95">Cancel</button></div>
        </SimpleModal>
      </div>
    );
  };

  return (<>{renderMain()}<AnimatePresence>{isDebugModalOpen && <DebugLogsModal isOpen={isDebugModalOpen} onClose={() => setIsDebugModalOpen(false)} logs={logs} />}</AnimatePresence></>);
}
