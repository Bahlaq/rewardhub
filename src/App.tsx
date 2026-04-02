/**
 * src/App.tsx
 *
 * Key changes from previous version:
 *  1. AdSimulatorModal completely removed — AdMob SDK handles ad UI natively.
 *  2. isAdOpen / isBoostAd states removed.
 *  3. isAdLoading state added — disables Watch Ad button while ad is loading.
 *  4. admobService.initialize() called once after user authenticates.
 *  5. admobService.showBanner() called once after user authenticates (native only).
 *  6. handleWatchAd() triggers the real AdMob rewarded ad via watchAd() hook.
 *  7. handleAdWatched is removed — reward is handled inside watchAd() callback.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  X,
  ShieldCheck,
  Trash2,
  Terminal,
  Zap,
  LayoutDashboard,
  User,
  History,
} from 'lucide-react';
import { Clipboard } from '@capacitor/clipboard';
import { Toast } from '@capacitor/toast';
import { Browser } from '@capacitor/browser';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Offer, UserProfile, Transaction } from './types';
import { useAds, WatchAdResult } from './hooks/useAds';
import { firebaseService, FirebaseUser, isConfigValid } from './services/firebase';
import { admobService } from './services/admob';
import { APP_NAME, APP_VERSION } from './constants';
import { HomeScreen } from './components/HomeScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { HistoryScreen } from './components/HistoryScreen';

import icon from '../assets/icon.png';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Logo ──────────────────────────────────────────────────────────────────

const Logo = ({ className }: { className?: string }) => (
  <div className={cn('relative w-full mx-auto group cursor-pointer', className)}>
    <img
      src={icon}
      alt={`${APP_NAME} Logo`}
      className="w-full h-auto object-contain rounded-[2.5rem] shadow-2xl transition-transform group-hover:scale-105"
      referrerPolicy="no-referrer"
    />
  </div>
);

// ─── Navbar ────────────────────────────────────────────────────────────────

const Navbar = ({
  activeTab,
  setActiveTab,
}: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) => {
  const tabs = [
    { id: 'offers',  icon: LayoutDashboard, label: 'Rewards' },
    { id: 'history', icon: History,          label: 'History' },
    { id: 'profile', icon: User,             label: 'Profile' },
  ];
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-6 pt-3 z-50"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      <div className="max-w-md mx-auto flex justify-between items-center">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex flex-col items-center gap-1 transition-colors',
              activeTab === tab.id
                ? 'text-indigo-600'
                : 'text-zinc-400 hover:text-zinc-600'
            )}
          >
            <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
            <span className="text-[10px] font-medium uppercase tracking-wider">
              {tab.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
};

// ─── Header ────────────────────────────────────────────────────────────────

const Header = ({ user }: { user: UserProfile }) => {
  const safePoints = Math.max(0, Number(user.points ?? 0));
  return (
    <header
      className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-zinc-100 px-5 pb-2 z-40"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      <div className="max-w-md mx-auto flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Logo className="max-w-[36px]" />
          <div>
            <h1 className="text-base font-black tracking-tight text-zinc-900 leading-none">
              {APP_NAME}
            </h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">
              Earn while you play
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 shadow-sm">
          <Zap size={14} className="text-indigo-600 fill-indigo-600" />
          <span className="text-sm font-bold text-indigo-700">
            {safePoints.toLocaleString()} pts
          </span>
        </div>
      </div>
    </header>
  );
};

// ─── Debug Logs Modal ──────────────────────────────────────────────────────

const DebugLogsModal = ({
  isOpen, onClose, logs,
}: { isOpen: boolean; onClose: () => void; logs: any[] }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
          <h3 className="text-lg font-bold text-white">System Debug Logs</h3>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[10px]">
          {logs.length === 0
            ? <p className="text-zinc-500 text-center py-10 italic">No logs yet.</p>
            : [...logs].reverse().map((log) => (
              <div key={log.id} className={cn(
                'p-2 rounded border',
                log.event === 'error'  ? 'bg-rose-900/20 border-rose-900/50 text-rose-400'
                : log.event === 'reward' ? 'bg-emerald-900/20 border-emerald-900/50 text-emerald-400'
                : 'bg-zinc-800/50 border-zinc-700 text-zinc-400'
              )}>
                <div className="flex justify-between mb-1 opacity-50">
                  <span>{log.type?.toUpperCase()}</span>
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="break-all">{log.message}</div>
              </div>
            ))}
        </div>
        <div className="p-4 border-t border-zinc-800">
          <button onClick={onClose} className="w-full py-3 bg-zinc-800 text-white rounded-xl font-bold">
            Close Debugger
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Privacy Modal ─────────────────────────────────────────────────────────

const PrivacyModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <div className="p-8">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
            <ShieldCheck size={24} className="text-indigo-600" />
          </div>
          <h3 className="text-xl font-black text-zinc-900 mb-4">Privacy Policy</h3>
          <div className="space-y-4 text-sm text-zinc-600 leading-relaxed max-h-[40vh] overflow-y-auto pr-2">
            <p className="font-bold text-zinc-900">Data Collection:</p>
            <p>We only collect your login information (email) to securely store and sync your earned points across devices.</p>
            <p className="font-bold text-zinc-900">Data Deletion & User Rights:</p>
            <p>You can delete your account and all associated data at any time through "Delete Account" in settings.</p>
            <p className="font-bold text-zinc-900">Third Parties & Ads:</p>
            <p>We do not sell your data. Our app uses Google AdMob for advertisements, which may collect device identifiers for ad personalization.</p>
          </div>
          <button onClick={onClose}
            className="w-full mt-8 bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
          >
            Got it
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Delete Account Modal ──────────────────────────────────────────────────

const DeleteAccountModal = ({
  isOpen, onClose, onConfirm,
}: { isOpen: boolean; onClose: () => void; onConfirm: () => void }) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <div className="p-8">
          <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-6">
            <AlertCircle size={24} className="text-rose-600" />
          </div>
          <h3 className="text-xl font-black text-zinc-900 mb-2">Delete Account?</h3>
          <p className="text-sm text-zinc-500 mb-8">
            This action is permanent. All your points and history will be deleted forever.
          </p>
          <div className="flex flex-col gap-3">
            <button onClick={onConfirm}
              className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all active:scale-95"
            >
              Yes, Delete Everything
            </button>
            <button onClick={onClose}
              className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold hover:bg-zinc-200 transition-all active:scale-95"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Confirm Modal ─────────────────────────────────────────────────────────

const ConfirmModal = ({
  isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel',
}: {
  isOpen: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: string; confirmText?: string; cancelText?: string;
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <div className="p-8">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
            <AlertCircle size={24} className="text-indigo-600" />
          </div>
          <h3 className="text-xl font-black text-zinc-900 mb-2">{title}</h3>
          <p className="text-sm text-zinc-500 mb-8">{message}</p>
          <div className="flex flex-col gap-3">
            <button onClick={() => { onConfirm(); onClose(); }}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
            >
              {confirmText}
            </button>
            <button onClick={onClose}
              className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold hover:bg-zinc-200 transition-all active:scale-95"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Main App ──────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab,     setActiveTab]     = useState('offers');
  const [firebaseUser,  setFirebaseUser]  = useState<FirebaseUser | null>(null);
  const [user,          setUser]          = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAdLoading,   setIsAdLoading]   = useState(false); // true while AdMob ad is showing

  // ── Modal states ────────────────────────────────────────────────────────────
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isDeleteOpen,  setIsDeleteOpen]  = useState(false);
  const [isDebugOpen,   setIsDebugOpen]   = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '', message: '', confirmText: 'Confirm', onConfirm: () => {},
  });

  // ── Auth listener ────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = firebaseService.onAuthChange((fUser) => {
      setFirebaseUser(fUser);
      if (!fUser) setIsAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Firestore listeners + AdMob init ─────────────────────────────────────────
  const [firestoreClaims,  setFirestoreClaims]  = useState<Transaction[]>([]);
  const [firestoreHistory, setFirestoreHistory] = useState<Transaction[]>([]);

  useEffect(() => {
    if (!firebaseUser?.uid) {
      setUser(null);
      setFirestoreClaims([]);
      setFirestoreHistory([]);
      return;
    }

    const uid = firebaseUser.uid;
    setIsAuthLoading(true);

    // Daily reset — never touches points
    firebaseService.checkDailyReset(uid);

    // Initialize real AdMob + show banner (native only, no-op on web)
    admobService.initialize().then(() => {
      admobService.showBanner();
    });

    const unsubProfile = firebaseService.onProfileChange(uid, (profile) => {
      if (profile) {
        setUser(profile);
      } else {
        const fresh: UserProfile = {
          uid,
          email: firebaseUser.email ?? (uid.startsWith('local_guest_') ? 'Guest User' : 'Unknown'),
          points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0,
          boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0,
          lastBoostDate: new Date().toDateString(),
        };
        firebaseService.saveUserProfile(fresh);
      }
      setIsAuthLoading(false);
    });

    const unsubClaims  = firebaseService.onClaimsChange(uid, setFirestoreClaims);
    const unsubHistory = firebaseService.onHistoryChange(uid, setFirestoreHistory);

    return () => {
      unsubProfile();
      unsubClaims();
      unsubHistory();
      admobService.removeBanner();
    };
  }, [firebaseUser?.uid]);

  // ── Search / filter ─────────────────────────────────────────────────────────
  const [searchQuery,      setSearchQuery]      = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const categories = ['all', 'Fashion', 'Delivery apps', 'Shopping', 'Travel', 'Food', 'General'];

  // ── useAds hook ─────────────────────────────────────────────────────────────
  const {
    logs, addLog, watchAd, claimBoostReward, offers, isLoading, onOffersChange,
  } = useAds(firebaseUser?.uid);

  useEffect(() => {
    const unsub = onOffersChange();
    return () => unsub();
  }, [onOffersChange]);

  // ── Transactions ────────────────────────────────────────────────────────────
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>(() => {
    try {
      const s = localStorage.getItem('local_transactions');
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try {
      localStorage.setItem('local_transactions', JSON.stringify(localTransactions.slice(0, 50)));
    } catch {}
  }, [localTransactions]);

  const transactions = useMemo<Transaction[]>(() => {
    const all    = [...localTransactions, ...firestoreClaims, ...firestoreHistory];
    const unique = Array.from(new Map(all.map((t) => [t.id, t])).values());
    return unique.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [localTransactions, firestoreClaims, firestoreHistory]);

  // ── Filtered offers ─────────────────────────────────────────────────────────
  const filteredOffers = useMemo(() => {
    return offers.filter((offer) => {
      const sel = selectedCategory.toLowerCase();
      const matchesCat =
        sel === 'all' ||
        (Array.isArray(offer.category)
          ? offer.category.some((c) => String(c).toLowerCase() === sel)
          : String(offer.category ?? '').toLowerCase() === sel);
      if (!matchesCat) return false;
      const q = searchQuery.toLowerCase();
      return (
        offer.brand.toLowerCase().includes(q) ||
        offer.description.toLowerCase().includes(q) ||
        offer.type.toLowerCase().includes(q)
      );
    });
  }, [offers, searchQuery, selectedCategory]);

  // ── Ad handlers ─────────────────────────────────────────────────────────────

  /**
   * Called when user taps "Watch Ad" on HomeScreen.
   *
   * Flow:
   *   1. setIsAdLoading(true) → Watch Ad button shows spinner
   *   2. watchAd() calls admobService.showRewardedAd()
   *      → Native AdMob SDK shows the full-screen ad
   *      → When user earns reward, Firestore.recordAdWatch() is called inside the callback
   *      → Returns Firestore-confirmed WatchAdResult
   *   3. setIsAdLoading(false) → button returns to normal
   *   4. Firestore real-time listener updates user.currentLevelAdCounter
   *   5. HomeScreen re-renders with correct counter
   *   6. If counter >= boostLevel, HomeScreen shows the Claim button automatically
   */
  const handleWatchAd = async () => {
    setIsAdLoading(true);
    try {
      const result: WatchAdResult | null = await watchAd();
      if (result) {
        addLog(
          'rewarded',
          'reward',
          `Counter confirmed: ${result.currentLevelAdCounter}/${result.adsNeeded} (Level ${result.boostLevel})`
        );
      } else {
        // Ad was not watched (dismissed, network error, etc.)
        // Error already logged in useAds
      }
    } finally {
      setIsAdLoading(false);
    }
  };

  /**
   * Called when user taps "Claim +100 Points" on HomeScreen.
   * The button only appears when Firestore confirms currentLevelAdCounter >= boostLevel.
   * The Firestore transaction validates this server-side as a second safety check.
   */
  const handleClaimBoostReward = async (): Promise<void> => {
    const result = await claimBoostReward();
    if (result) {
      await Toast.show({
        text: `🎉 Boost Level ${result.completedLevel} Complete! +100 pts`,
        duration: 'long',
      });
    } else {
      await Toast.show({ text: 'Error claiming reward. Please try again.', duration: 'short' });
    }
  };

  // ── Offer claim ──────────────────────────────────────────────────────────────
  const handleClaimOffer = async (offer: Offer, currentCost: number) => {
    if (!user) return;
    const safePoints = Math.max(0, Number(user.points ?? 0));

    if (safePoints < currentCost) {
      setConfirmConfig({
        title:       'Not Enough Points',
        message:     `You need ${currentCost - safePoints} more points. Watch an ad to earn 100 pts?`,
        confirmText: 'Watch Ad',
        onConfirm:   handleWatchAd,
      });
      setIsConfirmOpen(true);
      return;
    }

    try {
      await firebaseService.claimOffer(user.uid, offer);
      addLog('banner', 'reward', `Claimed ${offer.brand}`);
      if (!offer.code) {
        await Browser.open({ url: offer.url });
      } else {
        setConfirmConfig({
          title:       'Offer Unlocked!',
          message:     `Your code for ${offer.brand}: ${offer.code}`,
          confirmText: 'Copy Code',
          onConfirm:   async () => {
            await Clipboard.write({ string: offer.code! });
            await Toast.show({ text: 'Code copied!', duration: 'short' });
          },
        });
        setIsConfirmOpen(true);
      }
    } catch (err) {
      console.error('Claim failed:', err);
      await Toast.show({ text: 'Failed to claim offer. Please try again.', duration: 'long' });
    }
  };

  // ── Auth actions ─────────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    setIsAuthLoading(true);
    try {
      const fUser = await firebaseService.signInWithGoogle();
      setFirebaseUser(fUser);
      await Toast.show({ text: 'Signed in successfully!', duration: 'short' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog('app_open', 'error', `Sign-in error: ${msg}`);
      await Toast.show({ text: 'Sign-in failed. Open debugger for details.', duration: 'long' });
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    setIsAuthLoading(true);
    try {
      const fUser = await firebaseService.signInAnonymously();
      setFirebaseUser(fUser);
    } catch (err) {
      console.error('Anonymous sign-in failed:', err);
      let localUid = localStorage.getItem('persistent_guest_id');
      if (!localUid) {
        localUid = 'local_guest_' + Math.random().toString(36).slice(2, 11);
        localStorage.setItem('persistent_guest_id', localUid);
      }
      setFirebaseUser({ uid: localUid, isAnonymous: true } as any);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await admobService.removeBanner();
    try { await firebaseService.logout(); } catch {}
    setFirebaseUser(null);
    setUser(null);
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setIsAuthLoading(true);
    try {
      await firebaseService.deleteUserProfile(user.uid);
      if (!user.uid.startsWith('local_guest_')) {
        await firebaseService.deleteAccount();
      }
      await Toast.show({ text: 'Account deleted.', duration: 'long' });
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        await Toast.show({ text: 'Please sign out and sign in again before deleting.', duration: 'long' });
      } else {
        await Toast.show({ text: 'Failed to delete account. Try again later.', duration: 'long' });
      }
    } finally {
      await admobService.removeBanner();
      setFirebaseUser(null);
      setUser(null);
      setIsAuthLoading(false);
      setIsDeleteOpen(false);
    }
  };

  // ── Config guard ─────────────────────────────────────────────────────────────
  if (!isConfigValid) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle size={48} className="text-rose-500 mb-4" />
        <h1 className="text-xl font-bold text-zinc-900 mb-2">Configuration Error</h1>
        <p className="text-sm text-zinc-500 max-w-xs">
          Firebase configuration is missing. Check your environment variables.
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const renderContent = () => {

    if (isAuthLoading) {
      return (
        <div
          className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center gap-6"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <Logo className="max-w-[120px]" />
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    if (!firebaseUser) {
      return (
        <div
          className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-8 text-center"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="w-full max-w-sm flex flex-col items-center">
            <Logo className="max-w-[160px]" />
            <h1 className="text-3xl font-black tracking-tight text-zinc-900 mt-8 mb-3">
              Welcome to RewardHub
            </h1>
            <p className="text-sm text-zinc-500 mb-10 max-w-[280px]">
              Sign in with Google to start earning points and save your progress.
            </p>
            <div className="w-full space-y-4">
              <button
                onClick={handleSignIn}
                disabled={isAuthLoading}
                className="w-full bg-white border border-zinc-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-sm hover:shadow-md transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isAuthLoading
                  ? <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  : <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                }
                {isAuthLoading ? 'Signing in…' : 'Continue with Google'}
              </button>
              <button
                onClick={handleGuestSignIn}
                className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-zinc-200 hover:bg-zinc-800 transition-all active:scale-95"
              >
                <User size={20} />
                Continue as Guest
              </button>
            </div>
            <p className="mt-12 text-[10px] text-zinc-400 font-medium uppercase tracking-widest">
              Version {APP_VERSION}
            </p>
            <button
              onClick={() => setIsDebugOpen(true)}
              className="mt-4 flex items-center gap-2 text-[10px] font-bold text-zinc-300 uppercase tracking-wider hover:text-zinc-500 transition-colors"
            >
              <Terminal size={12} />
              System Debugger
            </button>
          </div>
        </div>
      );
    }

    if (!user) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-zinc-50 p-6">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Loading Profile…</p>
        </div>
      );
    }

    const safePoints = Math.max(0, Number(user.points ?? 0));
    const userWithSafePoints: UserProfile = { ...user, points: safePoints };

    return (
      <div className="h-screen flex flex-col bg-zinc-50 font-sans overflow-hidden">
        <div className="flex-1 overflow-y-auto scroll-smooth relative">
          <Header user={userWithSafePoints} />

          <main className="max-w-md mx-auto px-6 py-6 pb-[120px]">
            <AnimatePresence mode="wait">

              {activeTab === 'offers' && (
                <HomeScreen
                  user={userWithSafePoints}
                  offers={offers}
                  isLoading={isLoading}
                  isAdLoading={isAdLoading}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  selectedCategory={selectedCategory}
                  setSelectedCategory={setSelectedCategory}
                  categories={categories}
                  filteredOffers={filteredOffers}
                  transactions={transactions}
                  handleWatchAd={handleWatchAd}
                  handleClaimOffer={handleClaimOffer}
                  handleClaimBoostReward={handleClaimBoostReward}
                />
              )}

              {activeTab === 'history' && (
                <HistoryScreen transactions={transactions} />
              )}

              {activeTab === 'profile' && (
                <ProfileScreen
                  user={userWithSafePoints}
                  claimsCount={transactions.filter((t) => t.type === 'claim').length}
                  onSignOut={handleSignOut}
                  onDeleteAccount={() => setIsDeleteOpen(true)}
                  onOpenPrivacy={() => setIsPrivacyOpen(true)}
                  onOpenDebug={() => setIsDebugOpen(true)}
                />
              )}

            </AnimatePresence>
          </main>
        </div>

        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Modals */}
        <AnimatePresence>
          {isPrivacyOpen && <PrivacyModal isOpen onClose={() => setIsPrivacyOpen(false)} />}
        </AnimatePresence>
        <AnimatePresence>
          {isDeleteOpen && (
            <DeleteAccountModal isOpen onClose={() => setIsDeleteOpen(false)} onConfirm={handleDeleteAccount} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {isConfirmOpen && (
            <ConfirmModal
              isOpen
              onClose={() => setIsConfirmOpen(false)}
              onConfirm={confirmConfig.onConfirm}
              title={confirmConfig.title}
              message={confirmConfig.message}
              confirmText={confirmConfig.confirmText}
            />
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <>
      {renderContent()}
      <AnimatePresence>
        {isDebugOpen && (
          <DebugLogsModal isOpen onClose={() => setIsDebugOpen(false)} logs={logs} />
        )}
      </AnimatePresence>
    </>
  );
}
