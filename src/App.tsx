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

// ═══════════════════════════════════════════════════════════════════════
// ARCHITECTURE: THREE FULLY DECOUPLED SYSTEMS
//
// 1. APP OPEN AD: Fires 3 seconds after component mount. No dependency
//    on notifications. If it fails, it fails silently.
//
// 2. NOTIFICATIONS: Fires 10+ seconds after auth via fire-and-forget.
//    The initPushNotifications function has its OWN internal 10-second
//    delay. Total: 10s (our delay) + 10s (internal) = 20s after auth.
//    CANNOT interfere with ads because they're separated by 17+ seconds.
//
// 3. COUNTRY FILTER: Client-side filtering using offerMatchesCountry()
//    which checks BOTH 'countries' (array) and 'country' (string) fields
//    with UPPERCASE comparison for case-insensitive matching.
//
// NO system depends on any other system's success or failure.
// ═══════════════════════════════════════════════════════════════════════

const CD_MS = 2 * 60 * 1000;
const CD_KEY = 'rh_cd';
function loadCD() { try { const r = localStorage.getItem(CD_KEY); if (!r) return null; const p = JSON.parse(r); if (Date.now() - p.s >= CD_MS) { localStorage.removeItem(CD_KEY); return null; } return p; } catch { return null; } }

const Logo = ({ className }: { className?: string }) => (<div className={cn("relative w-full mx-auto", className)}><img src={icon} alt={APP_NAME} className="w-full h-auto object-contain rounded-[2.5rem] shadow-2xl" referrerPolicy="no-referrer" /></div>);

const Nav = ({ tab, set }: { tab: string, set: (t: string) => void }) => (
  <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-6 pt-3 z-50" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
    <div className="max-w-md mx-auto flex justify-between">
      {[{ id: 'offers', icon: LayoutDashboard, label: 'Rewards' }, { id: 'profile', icon: User, label: 'Profile' }].map(t => (
        <button key={t.id} onClick={() => set(t.id)} className={cn("flex flex-col items-center gap-1", tab === t.id ? "text-indigo-600" : "text-zinc-400")}>
          <t.icon size={20} strokeWidth={tab === t.id ? 2.5 : 2} /><span className="text-[10px] font-medium uppercase tracking-wider">{t.label}</span></button>))}
    </div></nav>);

const Hdr = ({ user }: { user: UserProfile }) => (
  <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-zinc-100 px-5 pb-2 z-40" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}>
    <div className="max-w-md mx-auto flex justify-between items-center">
      <div className="flex items-center gap-3"><Logo className="max-w-[36px]" /><div><h1 className="text-base font-black text-zinc-900 leading-none">{APP_NAME}</h1><p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">Earn while you play</p></div></div>
      <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100"><Zap size={14} className="text-indigo-600 fill-indigo-600" /><span className="text-sm font-bold text-indigo-700">{Math.max(0, Number(user.points || 0))} pts</span></div>
    </div></header>);

const WebAd = ({ isOpen, onDone, onSkip, num, total }: { isOpen: boolean; onDone: () => void; onSkip: () => void; num: number; total: number }) => {
  const [t, setT] = useState(5); const [fin, setFin] = useState(false);
  useEffect(() => { if (!isOpen) return; setT(5); setFin(false); const i = setInterval(() => setT(p => { if (p <= 1) { clearInterval(i); setFin(true); return 0; } return p - 1; }), 1000); return () => clearInterval(i); }, [isOpen]);
  if (!isOpen) return null;
  return (<div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/90"><div className="w-full max-w-sm bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800">
    <div className="relative aspect-video bg-zinc-800 flex items-center justify-center"><PlayCircle size={48} className="text-zinc-600 animate-pulse" /><div className="absolute top-4 left-4 bg-indigo-500/80 px-3 py-1 rounded-full text-white text-xs font-bold">{num}/{total}</div><div className="absolute top-4 right-4 bg-black/50 px-3 py-1 rounded-full text-white text-xs font-bold">{fin ? '✓' : `${t}s`}</div></div>
    <div className="p-6 text-center"><h3 className="text-lg font-bold text-white mb-2">Sponsored Content</h3><button onClick={() => fin ? onDone() : onSkip()} className={cn("w-full py-3 rounded-2xl font-bold mt-4", fin ? "bg-emerald-500 text-white" : "bg-zinc-800 text-zinc-500")}>{fin ? 'Continue' : 'Skip'}</button></div></div></div>);
};

const Dlg = ({ open, close, children }: { open: boolean; close: () => void; children: React.ReactNode }) => {
  if (!open) return null;
  return (<div className="fixed inset-0 z-[9999] flex items-center justify-center p-6"><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={close} className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" />
    <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"><div className="p-8">{children}</div></motion.div></div>);
};

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
  const webRef = useRef<((v: boolean) => void) | null>(null);
  const bgRef = useRef(0);

  // Cooldown
  const [cd, setCd] = useState(false);
  const [cdSec, setCdSec] = useState(0);
  const cdI = useRef<any>(null);
  useEffect(() => { const s = loadCD(); if (s) { const r = CD_MS - (Date.now() - s.s); if (r > 0) { setCd(true); setCdSec(Math.ceil(r / 1000)); runCD(r); } } return () => { if (cdI.current) clearInterval(cdI.current); }; }, []);
  function runCD(ms: number) { if (cdI.current) clearInterval(cdI.current); const e = Date.now() + ms; setCd(true); setCdSec(Math.ceil(ms / 1000)); cdI.current = setInterval(() => { const r = e - Date.now(); if (r <= 0) { clearInterval(cdI.current); cdI.current = null; setCd(false); setCdSec(0); localStorage.removeItem(CD_KEY); } else setCdSec(Math.ceil(r / 1000)); }, 1000); }
  function startCD() { localStorage.setItem(CD_KEY, JSON.stringify({ s: Date.now() })); runCD(CD_MS); }

  // Country
  const [country, setCountry] = useState<string>(() => localStorage.getItem('rh_country') || 'All Countries');
  const onCountry = useCallback((c: string) => { setCountry(c); localStorage.setItem('rh_country', c); }, []);

  // Auth
  useEffect(() => { const u = firebaseService.onAuthChange(f => { setFbUser(f); if (!f) setAuthLoading(false); }); return () => u(); }, []);

  // Ads hook
  const { offers, isLoading, onOffersChange, showRewardedAdAndWait, recordAdWatch, claimBoostReward, showBanner, hideBanner, showAppOpenAd, isNative } = useAds(fbUser?.uid);

  // ═══════════════════════════════════════════════════════════════════
  // SYSTEM 1: APP OPEN AD — Cold start (3 second delay, independent)
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('[App] Showing App Open Ad (cold start)');
      showAppOpenAd();
    }, 3000);
    return () => clearTimeout(timer);
  }, [showAppOpenAd]);

  // Resume from background (5+ seconds)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') bgRef.current = Date.now();
      else if (document.visibilityState === 'visible' && bgRef.current > 0 && Date.now() - bgRef.current >= 5000) {
        console.log('[App] Showing App Open Ad (resume)');
        showAppOpenAd();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [showAppOpenAd]);

  // ═══════════════════════════════════════════════════════════════════
  // SYSTEM 2: NOTIFICATIONS — Fire-and-forget, 10+ second delay
  // Completely independent. Cannot crash the app. Cannot block ads.
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!fbUser?.uid) return;
    const uid = fbUser.uid;

    // Fire and forget — don't await, don't block anything
    import('./services/notifications').then(mod => {
      mod.initPushNotifications((token: string) => {
        console.log('[App] Saving FCM token to Firestore...');
        firebaseService.saveFcmToken(uid, token).then(() => {
          console.log('[App] FCM token saved successfully');
        }).catch(err => {
          console.error('[App] FCM token save FAILED:', err);
        });
      });
    }).catch(err => {
      console.error('[App] Notification module load failed (non-fatal):', err);
    });
  }, [fbUser?.uid]);

  // Firestore listeners
  const [fsClaims, setFsClaims] = useState<Transaction[]>([]);
  const [fsHistory, setFsHistory] = useState<Transaction[]>([]);
  useEffect(() => {
    if (!fbUser?.uid) { setUser(null); setFsClaims([]); setFsHistory([]); return; }
    const uid = fbUser.uid; setAuthLoading(true);
    firebaseService.checkDailyReset(uid);
    const u1 = firebaseService.onProfileChange(uid, p => { if (p) setUser(p); else firebaseService.saveUserProfile({ uid, email: fbUser.email || (uid.startsWith('local_guest_') ? 'Guest User' : 'Unknown'), points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0, boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: new Date().toDateString() }); setAuthLoading(false); });
    const u2 = firebaseService.onClaimsChange(uid, setFsClaims);
    const u3 = firebaseService.onHistoryChange(uid, setFsHistory);
    return () => { u1(); u2(); u3(); };
  }, [fbUser?.uid]);

  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const cats = ['all', 'Fashion', 'Delivery apps', 'Shopping', 'Travel', 'Food', 'General', 'Entertainment', 'Tech'];
  const [localTx, setLocalTx] = useState<Transaction[]>(() => { try { return JSON.parse(localStorage.getItem('local_transactions') || '[]'); } catch { return []; } });
  const tx = useMemo(() => Array.from(new Map([...localTx, ...fsClaims, ...fsHistory].map(t => [t.id, t])).values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()), [localTx, fsClaims, fsHistory]);
  useEffect(() => { localStorage.setItem('local_transactions', JSON.stringify(localTx.slice(0, 50))); }, [localTx]);
  const pts = useMemo(() => Math.max(0, tx.reduce((a, t) => t.type === 'earn' ? a + t.amount : t.type === 'claim' ? a - t.amount : a, 0)), [tx]);

  useEffect(() => { const u = onOffersChange(); return () => u(); }, [onOffersChange]);

  // ═══════════════════════════════════════════════════════════════════
  // SYSTEM 3: COUNTRY FILTER — Client-side, handles both field names
  // ═══════════════════════════════════════════════════════════════════
  const filtered = useMemo(() => offers.filter(o => {
    // Category
    const s = cat.toLowerCase();
    const oCats = Array.isArray(o.category) ? o.category.map(c => String(c).toLowerCase()) : [String(o.category || '').toLowerCase()];
    if (s !== 'all' && !oCats.includes(s)) return false;
    // Country (uses bulletproof matcher that handles both field names + uppercase)
    if (!offerMatchesCountry(o, country)) return false;
    // Search
    const q = search.toLowerCase();
    return !q || o.brand.toLowerCase().includes(q) || o.description.toLowerCase().includes(q);
  }), [offers, search, cat, country]);

  // Banner
  useEffect(() => { if (isNative && tab === 'offers' && !adRunning) showBanner(); else if (isNative) hideBanner(); }, [tab, adRunning, isNative, showBanner, hideBanner]);

  // Web ad
  const showWeb = useCallback((n: number, t: number): Promise<boolean> => new Promise(r => { webRef.current = r; setWebNum(n); setWebTotal(t); setWebOpen(true); }), []);
  const webDone = useCallback(() => { setWebOpen(false); webRef.current?.(true); webRef.current = null; }, []);
  const webSkip = useCallback(() => { setWebOpen(false); webRef.current?.(false); webRef.current = null; }, []);

  const watchAd = async () => {
    if (adRunning || !user || cd) return;
    setAdRunning(true); if (isNative) await hideBanner();
    const bl = Number(user.boostLevel) || 1, cp = Number(user.currentLevelAdCounter) || 0, rem = bl - cp;
    if (rem <= 0) { await claim(); startCD(); setAdRunning(false); if (isNative) showBanner(); return; }
    let done = 0;
    for (let i = 0; i < rem; i++) {
      const n = cp + i + 1, ok = isNative ? await showRewardedAdAndWait() : await showWeb(n, bl);
      if (!ok) { Toast.show({ text: 'Ad not completed.', duration: 'short' }); break; }
      const r = await recordAdWatch(); if (r) { done++; if (n < bl) { Toast.show({ text: `Ad ${n}/${bl}!`, duration: 'short' }); await new Promise(r => setTimeout(r, 800)); } }
    }
    if (done === rem) { await claim(); startCD(); }
    setAdRunning(false); if (isNative && tab === 'offers') showBanner();
  };
  const claim = async () => { try { const r = await claimBoostReward(); if (r) Toast.show({ text: '+100 pts!', duration: 'long' }); } catch {} };

  const claimOffer = async (offer: Offer, cost: number) => {
    if (!user) return;
    if (user.points < cost) { setConfirmCfg({ title: 'Not Enough Points', msg: `Need ${cost - user.points} more.`, fn: watchAd }); setConfirmOpen(true); return; }
    try { await firebaseService.claimOffer(user.uid, offer); recordUnlock(offer.id);
      if (!offer.code) Browser.open({ url: offer.url }); else { setConfirmCfg({ title: 'Success!', msg: `Code: ${offer.code}`, fn: () => { Clipboard.write({ string: offer.code! }); Toast.show({ text: 'Copied!', duration: 'short' }); } }); setConfirmOpen(true); }
    } catch { Toast.show({ text: "Failed.", duration: 'long' }); }
  };

  const signIn = async () => { setAuthLoading(true); try { const u = await firebaseService.signInWithGoogle(); if (u) { setFbUser(u); Toast.show({ text: "Signed in!", duration: 'short' }); } } catch (e) { Toast.show({ text: (e instanceof Error ? e.message : String(e)).slice(0, 100), duration: 'long' }); } finally { setAuthLoading(false); } };
  const guest = async () => { setAuthLoading(true); try { const f = await firebaseService.signInAnonymously(); setFbUser(f); } catch { let id = localStorage.getItem('persistent_guest_id'); if (!id) { id = 'local_guest_' + Math.random().toString(36).substr(2, 9); localStorage.setItem('persistent_guest_id', id); } setFbUser({ uid: id, isAnonymous: true } as any); setUser({ uid: id, email: 'Guest User', points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0 }); } finally { setAuthLoading(false); } };
  const signOut = async () => { try { await firebaseService.logout(); } catch {} finally { setFbUser(null); setUser(null); } };
  const del = async () => { if (!user) return; setAuthLoading(true); try { await firebaseService.deleteUserProfile(user.uid); if (!user.uid.startsWith('local_guest_')) await firebaseService.deleteAccount(); Toast.show({ text: 'Deleted', duration: 'long' }); } catch (e: any) { Toast.show({ text: e.code === 'auth/requires-recent-login' ? "Re-sign in." : "Failed.", duration: 'long' }); } finally { setFbUser(null); setUser(null); setAuthLoading(false); setDeleteOpen(false); } };

  if (!isConfigValid) return (<div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6"><AlertCircle size={48} className="text-rose-500 mb-4" /><h1 className="text-xl font-bold">Config Error</h1></div>);
  if (authLoading) return (<div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center gap-6"><Logo className="max-w-[120px]" /><div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>);
  if (!fbUser) return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-full max-w-sm flex flex-col items-center"><Logo className="max-w-[160px]" /><h1 className="text-3xl font-black text-zinc-900 mt-8 mb-3">Welcome to {APP_NAME}</h1><p className="text-sm text-zinc-500 mb-10">Sign in to earn points.</p>
        <div className="w-full space-y-4">
          <button onClick={signIn} className="w-full bg-white border border-zinc-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-sm active:scale-95"><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="w-5 h-5" /> Continue with Google</button>
          <button onClick={guest} className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg active:scale-95"><User size={20} /> Continue as Guest</button>
        </div><p className="mt-12 text-[10px] text-zinc-400 uppercase tracking-widest">v{APP_VERSION}</p></div></div>);
  if (!user) return (<div className="h-screen flex flex-col items-center justify-center bg-zinc-50"><div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>);

  return (
    <div className="h-screen flex flex-col bg-zinc-50 font-sans overflow-hidden">
      <div className="flex-1 overflow-y-auto scroll-smooth relative">
        <Hdr user={{ ...user, points: pts }} />
        <main className="max-w-md mx-auto px-6 py-6 pb-[120px]">
          <AnimatePresence mode="wait">
            {tab === 'offers' && <HomeScreen user={{ ...user, points: pts }} offers={offers} isLoading={isLoading} searchQuery={search} setSearchQuery={setSearch} selectedCategory={cat} setSelectedCategory={setCat} categories={cats} filteredOffers={filtered} transactions={tx} handleWatchAd={watchAd} handleClaimOffer={claimOffer} handleClaimBoostReward={claim} isAdRunning={adRunning} selectedCountry={country} setSelectedCountry={onCountry} isCooldownActive={cd} cooldownSecondsLeft={cdSec} />}
            {tab === 'profile' && (
              <motion.div key="profile" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm text-center">
                  <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4"><User size={40} className="text-indigo-600" /></div>
                  <h2 className="text-xl font-bold text-zinc-900">{user.email}</h2><p className="text-xs text-zinc-500 mt-1">v{APP_VERSION}</p>
                  <div className="grid grid-cols-2 gap-4 mt-8">
                    <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100"><span className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Points</span><span className="text-lg font-bold text-zinc-900">{pts}</span></div>
                    <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100"><span className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Claims</span><span className="text-lg font-bold text-zinc-900">{tx.filter(t => t.type === 'claim').length}</span></div>
                  </div></div>
                <div className="space-y-3">
                  <button onClick={() => setPrivacyOpen(true)} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm"><div className="flex items-center gap-3"><ShieldCheck size={20} className="text-indigo-600" /><span className="text-sm font-bold text-zinc-700">Privacy Policy</span></div><ChevronRight size={18} className="text-zinc-400" /></button>
                  <button onClick={signOut} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm"><div className="flex items-center gap-3"><ExternalLink size={20} className="text-zinc-400" /><span className="text-sm font-bold text-zinc-700">Sign Out</span></div><ChevronRight size={18} className="text-zinc-400" /></button>
                  <button onClick={() => setDeleteOpen(true)} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-rose-200 shadow-sm"><div className="flex items-center gap-3"><Trash2 size={20} className="text-rose-500" /><span className="text-sm font-bold text-rose-600">Delete Account</span></div><ChevronRight size={18} className="text-rose-400" /></button>
                </div>
                <div className="space-y-3"><h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">History</h2>
                  {tx.length === 0 ? <div className="bg-white rounded-2xl p-8 border border-dashed border-zinc-200 text-center"><History size={24} className="text-zinc-300 mx-auto mb-2" /><p className="text-xs text-zinc-500">No transactions</p></div>
                  : tx.slice(0, 20).map(t => (
                    <div key={t.id} className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm flex justify-between items-center">
                      <div className="flex items-center gap-3"><div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", t.type === 'earn' ? "bg-emerald-50" : "bg-indigo-50")}>{t.type === 'earn' ? <TrendingUp size={16} className="text-emerald-600" /> : <Gift size={16} className="text-indigo-600" />}</div>
                      <div><p className="text-xs font-bold text-zinc-900">{t.title}</p><p className="text-[10px] text-zinc-400">{new Date(t.timestamp).toLocaleDateString()}</p></div></div>
                      <div className="text-right"><span className={cn("text-sm font-bold", t.type === 'earn' ? "text-emerald-600" : "text-indigo-600")}>{t.type === 'earn' ? '+' : '-'}{Math.abs(t.amount)} pts</span>
                      {t.code && <button onClick={async () => { await Clipboard.write({ string: t.code! }); Toast.show({ text: 'Copied!', duration: 'short' }); }} className="text-[10px] font-mono bg-zinc-100 px-2 py-0.5 rounded text-zinc-600 border border-zinc-200">{t.code}</button>}</div>
                    </div>))}<div className="h-40" /></div>
              </motion.div>)}
          </AnimatePresence>
        </main>
      </div>
      <Nav tab={tab} set={setTab} />
      <WebAd isOpen={webOpen} onDone={webDone} onSkip={webSkip} num={webNum} total={webTotal} />
      <Dlg open={privacyOpen} close={() => setPrivacyOpen(false)}>
        <div className="flex items-center gap-3 mb-6"><ShieldCheck size={24} className="text-indigo-600" /><h3 className="text-xl font-black text-zinc-900">Privacy Policy</h3></div>
        <div className="text-sm text-zinc-600 space-y-3 max-h-[40vh] overflow-y-auto"><p className="font-bold text-zinc-900">Data:</p><p>Email and activity for functionality.</p><p className="font-bold text-zinc-900">Deletion:</p><p>Anytime from Profile.</p><p className="font-bold text-zinc-900">Ads:</p><p>Google AdMob. Never sell data.</p></div>
        <button onClick={() => setPrivacyOpen(false)} className="w-full mt-6 bg-indigo-600 text-white py-4 rounded-2xl font-bold active:scale-95">Got it</button>
      </Dlg>
      <Dlg open={deleteOpen} close={() => setDeleteOpen(false)}>
        <AlertCircle size={24} className="text-rose-600 mb-4" /><h3 className="text-xl font-black text-zinc-900 mb-2">Delete Account?</h3><p className="text-sm text-zinc-500 mb-6">Permanent.</p>
        <button onClick={del} className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold active:scale-95 mb-3">Delete</button><button onClick={() => setDeleteOpen(false)} className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold active:scale-95">Cancel</button>
      </Dlg>
      <Dlg open={confirmOpen} close={() => setConfirmOpen(false)}>
        <AlertCircle size={24} className="text-indigo-600 mb-4" /><h3 className="text-xl font-black text-zinc-900 mb-2">{confirmCfg.title}</h3><p className="text-sm text-zinc-500 mb-6">{confirmCfg.msg}</p>
        <button onClick={() => { confirmCfg.fn(); setConfirmOpen(false); }} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold active:scale-95 mb-3">Confirm</button><button onClick={() => setConfirmOpen(false)} className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold active:scale-95">Cancel</button>
      </Dlg>
    </div>
  );
}
