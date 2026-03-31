import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  X,
  PlayCircle,
  ShieldCheck,
  Trash2,
  Terminal,
  Zap,
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

import {
  LayoutDashboard,
  User,
  History,
} from 'lucide-react';

const Navbar = ({
  activeTab,
  setActiveTab,
}: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) => {
  const tabs = [
    { id: 'offers',   icon: LayoutDashboard, label: 'Rewards'  },
    { id: 'history',  icon: History,          label: 'History'  },
    { id: 'profile',  icon: User,             label: 'Profile'  },
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
            <tab.icon
              size={20}
              strokeWidth={activeTab === tab.id ? 2.5 : 2}
            />
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

// ─── Ad Simulator Modal ────────────────────────────────────────────────────
/**
 * Boost ad modal.
 *
 * Shows a countdown per ad. After the timer finishes the user taps
 * "Next Ad" (counter < boostLevel) or "Claim +100 Points" (counter == boostLevel).
 *
 * onAdWatched  — called once per completed ad (increments counter in Firestore)
 * onClaim      — called when all ads are done (awards +100 pts, advances level)
 */
interface AdSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called once per completed ad */
  onAdWatched: () => Promise<void>;
  /** Called when the final ad is done and user taps Claim */
  onClaim: () => Promise<void>;
  user: UserProfile | null;
}

const AdSimulatorModal = ({
  isOpen,
  onClose,
  onAdWatched,
  onClaim,
  user,
}: AdSimulatorModalProps) => {
  const [timeLeft, setTimeLeft]       = useState(5);
  const [adFinished, setAdFinished]   = useState(false);
  const [localCounter, setLocalCounter] = useState(0); // ads watched inside this modal session
  const [busy, setBusy]               = useState(false);

  // boostLevel from Firestore (may update after each claim)
  const boostLevel = Math.max(1, Number(user?.boostLevel ?? 1));
  // How many ads were already done before this modal opened
  const baseCounter = Math.max(0, Number(user?.currentLevelAdCounter ?? 0));
  // Total watched = what was already recorded + what we've done in this session
  const totalWatched = baseCounter + localCounter;
  // All done when total equals boostLevel
  const allDone = totalWatched >= boostLevel;

  // Reset when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setLocalCounter(0);
    setTimeLeft(5);
    setAdFinished(false);
  }, [isOpen]);

  // Countdown
  useEffect(() => {
    if (!isOpen || adFinished) return;
    if (timeLeft <= 0) {
      setAdFinished(true);
      return;
    }
    const t = setTimeout(() => setTimeLeft((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [isOpen, adFinished, timeLeft]);

  if (!isOpen) return null;

  const handleAction = async () => {
    if (!adFinished || busy) return;
    setBusy(true);

    try {
      // Always record this ad watch
      await onAdWatched();
      const newLocal = localCounter + 1;
      setLocalCounter(newLocal);

      const newTotal = baseCounter + newLocal;

      if (newTotal >= boostLevel) {
        // All ads done — claim reward then close
        await onClaim();
        onClose();
      } else {
        // More ads needed — start the next one
        setTimeLeft(5);
        setAdFinished(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const displayCurrent = totalWatched + (adFinished ? 0 : 0); // what we show during countdown
  const adLabel = `Ad ${Math.min(totalWatched + 1, boostLevel)} of ${boostLevel}`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm"
      style={{
        paddingTop:    'calc(env(safe-area-inset-top) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)',
      }}
    >
      <div className="w-full max-w-sm bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl">
        {/* Video placeholder */}
        <div className="relative aspect-video bg-zinc-800 flex items-center justify-center">
          <PlayCircle size={48} className="text-zinc-600 animate-pulse" />
          <div className="absolute top-4 right-4 bg-black/50 px-3 py-1 rounded-full text-white text-xs font-bold">
            {adFinished ? 'Ad Complete!' : `Ad ends in ${timeLeft}s`}
          </div>
          <div className="absolute top-4 left-4 bg-black/50 px-3 py-1 rounded-full text-white text-xs font-bold">
            {adLabel}
          </div>
        </div>

        <div className="p-6 text-center">
          <h3 className="text-lg font-bold text-white mb-2">Daily Boost — Level {boostLevel}</h3>
          <p className="text-sm text-zinc-400 mb-1">
            Watched: {totalWatched + (adFinished ? 1 : 0)}/{boostLevel} ads
          </p>
          <p className="text-xs text-zinc-500 mb-6">
            {allDone || (adFinished && totalWatched + 1 >= boostLevel)
              ? 'All done! Claim your +100 points.'
              : `Watch ${boostLevel - totalWatched - (adFinished ? 1 : 0)} more ad${boostLevel - totalWatched - (adFinished ? 1 : 0) !== 1 ? 's' : ''} to earn +100 pts.`}
          </p>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-6">
            {Array.from({ length: boostLevel }).map((_, i) => {
              const watched = totalWatched + (adFinished ? 1 : 0);
              return (
                <div
                  key={i}
                  className={cn(
                    'w-2 h-2 rounded-full transition-colors',
                    i < watched
                      ? 'bg-emerald-400'
                      : i === watched
                      ? 'bg-indigo-400 animate-pulse'
                      : 'bg-zinc-600'
                  )}
                />
              );
            })}
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleAction}
              disabled={!adFinished || busy}
              className={cn(
                'w-full py-3 rounded-2xl font-bold transition-all',
                adFinished && !busy
                  ? totalWatched + 1 >= boostLevel
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600 active:scale-95'
                    : 'bg-indigo-500 text-white hover:bg-indigo-600 active:scale-95'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              )}
            >
              {busy
                ? 'Processing…'
                : !adFinished
                ? `Watching… (${timeLeft}s)`
                : totalWatched + 1 >= boostLevel
                ? '🎉 Claim +100 Points'
                : `Watch Next Ad (${totalWatched + 1}/${boostLevel})`}
            </button>

            {!busy && (
              <button
                onClick={onClose}
                className="w-full py-2 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Debug Logs Modal ──────────────────────────────────────────────────────

const DebugLogsModal = ({
  isOpen,
  onClose,
  logs,
}: {
  isOpen: boolean;
  onClose: () => void;
  logs: any[];
}) => {
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
          {logs.length === 0 ? (
            <p className="text-zinc-500 text-center py-10 italic">No logs yet.</p>
          ) : (
            [...logs].reverse().map((log) => (
              <div
                key={log.id}
                className={cn(
                  'p-2 rounded border',
                  log.event === 'error'
                    ? 'bg-rose-900/20 border-rose-900/50 text-rose-400'
                    : log.event === 'reward'
                    ? 'bg-emerald-900/20 border-emerald-900/50 text-emerald-400'
                    : 'bg-zinc-800/50 border-zinc-700 text-zinc-400'
                )}
              >
                <div className="flex justify-between mb-1 opacity-50">
                  <span>{log.type?.toUpperCase()}</span>
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="break-all">{log.message}</div>
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="w-full py-3 bg-zinc-800 text-white rounded-xl font-bold"
          >
            Close Debugger
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Privacy Modal ─────────────────────────────────────────────────────────

const PrivacyModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{
        paddingTop:    'calc(env(safe-area-inset-top) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)',
      }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
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
            <p>You can delete your account and all associated data at any time directly through the "Delete Account" option in the app settings. Once confirmed, all personal information will be permanently removed.</p>
            <p className="font-bold text-zinc-900">Third Parties & Ads:</p>
            <p>We do not sell your data. Our app uses Google AdMob for advertisements, which may collect device identifiers for ad personalization and analytics.</p>
          </div>
          <button
            onClick={onClose}
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
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{
        paddingTop:    'calc(env(safe-area-inset-top) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)',
      }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
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
            <button
              onClick={onConfirm}
              className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all active:scale-95"
            >
              Yes, Delete Everything
            </button>
            <button
              onClick={onClose}
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
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText  = 'Cancel',
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
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
            <button
              onClick={() => { onConfirm(); onClose(); }}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
            >
              {confirmText}
            </button>
            <button
              onClick={onClose}
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
  const [activeTab, setActiveTab]             = useState('offers');
  const [firebaseUser, setFirebaseUser]       = useState<FirebaseUser | null>(null);
  const [user, setUser]                       = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading]     = useState(true);

  // Modal states
  const [isPrivacyModalOpen,  setIsPrivacyModalOpen]  = useState(false);
  const [isDeleteModalOpen,   setIsDeleteModalOpen]   = useState(false);
  const [isDebugModalOpen,    setIsDebugModalOpen]    = useState(false);
  const [isConfirmModalOpen,  setIsConfirmModalOpen]  = useState(false);
  const [confirmConfig, setConfirmConfig]             = useState({
    title: '',
    message: '',
    confirmText: 'Confirm',
    onConfirm: () => {},
  });

  // Ad modal state
  const [isAdOpen, setIsAdOpen] = useState(false);

  // ── Auth listener ────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = firebaseService.onAuthChange((fUser) => {
      setFirebaseUser(fUser);
      if (!fUser) setIsAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Firestore real-time listeners ────────────────────────────────────────
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

    // Daily reset (never touches points)
    firebaseService.checkDailyReset(uid);

    const unsubProfile = firebaseService.onProfileChange(uid, (profile) => {
      if (profile) {
        setUser(profile);
      } else {
        // First-time: _ensureProfile in firebase.ts should have created the doc,
        // but guard here just in case.
        const fresh: UserProfile = {
          uid,
          email: firebaseUser.email ?? (uid.startsWith('local_guest_') ? 'Guest User' : 'Unknown'),
          points: 0,
          claimsToday: 0,
          lastClaimDate: null,
          totalEarned: 0,
          boostLevel: 1,
          adsWatchedToday: 0,
          currentLevelAdCounter: 0,
          lastBoostDate: new Date().toDateString(),
        };
        firebaseService.saveUserProfile(fresh);
      }
      setIsAuthLoading(false);
    });

    const unsubClaims = firebaseService.onClaimsChange(uid, setFirestoreClaims);
    const unsubHistory = firebaseService.onHistoryChange(uid, setFirestoreHistory);

    return () => {
      unsubProfile();
      unsubClaims();
      unsubHistory();
    };
  }, [firebaseUser?.uid]);

  // ── Search / category state ──────────────────────────────────────────────
  const [searchQuery,      setSearchQuery]      = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const categories = ['all', 'Fashion', 'Delivery apps', 'Shopping', 'Travel', 'Food', 'General'];

  // ── useAds hook ──────────────────────────────────────────────────────────
  const {
    logs,
    addLog,
    watchAd,
    claimBoostReward,
    offers,
    isLoading,
    onOffersChange,
  } = useAds(firebaseUser?.uid);

  useEffect(() => {
    const unsub = onOffersChange();
    return () => unsub();
  }, [onOffersChange]);

  // ── Merged transactions ──────────────────────────────────────────────────
  // Local transactions kept for immediate UI feedback before Firestore syncs
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('local_transactions');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try {
      localStorage.setItem('local_transactions', JSON.stringify(localTransactions.slice(0, 50)));
    } catch {}
  }, [localTransactions]);

  const transactions = useMemo<Transaction[]>(() => {
    const all = [...localTransactions, ...firestoreClaims, ...firestoreHistory];
    const unique = Array.from(new Map(all.map((tx) => [tx.id, tx])).values());
    return unique.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [localTransactions, firestoreClaims, firestoreHistory]);

  // ── Filtered offers ──────────────────────────────────────────────────────
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

  // ── Boost handlers ───────────────────────────────────────────────────────

  /** Called once per completed ad inside the modal */
  const handleAdWatched = async (): Promise<void> => {
    const result = await watchAd();
    if (result) {
      addLog(
        'rewarded',
        'show',
        `Ad recorded — ${result.currentLevelAdCounter}/${result.adsNeeded} (Level ${result.boostLevel})`
      );
    }
  };

  /** Called when the last ad is done and the user taps Claim */
  const handleClaimBoostReward = async (): Promise<void> => {
    const result = await claimBoostReward();
    if (result) {
      addLog(
        'rewarded',
        'reward',
        `Level ${result.completedLevel} claimed! +100 pts. Total: ${result.points}. Next: Level ${result.boostLevel}`
      );
      await Toast.show({
        text: `🎉 Boost Level ${result.completedLevel} Complete! +100 pts`,
        duration: 'long',
      });
    } else {
      await Toast.show({ text: 'Error claiming reward. Please try again.', duration: 'short' });
    }
  };

  // ── Offer claim ──────────────────────────────────────────────────────────
  const handleClaimOffer = async (offer: Offer, currentCost: number) => {
    if (!user) return;

    const safePoints = Math.max(0, Number(user.points ?? 0));
    if (safePoints < currentCost) {
      setConfirmConfig({
        title: 'Not Enough Points',
        message: `You need ${currentCost - safePoints} more points. Watch an ad to earn 100 pts?`,
        confirmText: 'Watch Ad',
        onConfirm: () => setIsAdOpen(true),
      });
      setIsConfirmModalOpen(true);
      return;
    }

    try {
      await firebaseService.claimOffer(user.uid, offer);
      addLog('banner', 'reward', `Claimed ${offer.brand}`);

      if (!offer.code) {
        await Browser.open({ url: offer.url });
      } else {
        setConfirmConfig({
          title: 'Offer Unlocked!',
          message: `Your code for ${offer.brand}: ${offer.code}`,
          confirmText: 'Copy Code',
          onConfirm: async () => {
            await Clipboard.write({ string: offer.code! });
            await Toast.show({ text: 'Code copied!', duration: 'short' });
          },
        });
        setIsConfirmModalOpen(true);
      }
    } catch (err) {
      console.error('Claim failed:', err);
      await Toast.show({ text: 'Failed to claim offer. Please try again.', duration: 'long' });
    }
  };

  // ── Auth actions ─────────────────────────────────────────────────────────
  const handleSignIn = async () => {
    setIsAuthLoading(true);
    try {
      const fUser = await firebaseService.signInWithGoogle();
      setFirebaseUser(fUser);
      await Toast.show({ text: 'Signed in successfully!', duration: 'short' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog('app_open', 'error', `Sign-in error: ${msg}`);
      await Toast.show({ text: `Sign-in failed: ${msg.slice(0, 60)}`, duration: 'long' });
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
      // Local fallback
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
      setFirebaseUser(null);
      setUser(null);
      setIsAuthLoading(false);
      setIsDeleteModalOpen(false);
    }
  };

  // ── Config guard ─────────────────────────────────────────────────────────
  if (!isConfigValid) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle size={48} className="text-rose-500 mb-4" />
        <h1 className="text-xl font-bold text-zinc-900 mb-2">Configuration Error</h1>
        <p className="text-sm text-zinc-500 max-w-xs">
          Firebase configuration is missing. Check your environment variables and restart.
        </p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const renderContent = () => {
    // Loading spinner
    if (isAuthLoading) {
      return (
        <div
          className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center gap-6"
          style={{
            paddingTop:    'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          <Logo className="max-w-[120px]" />
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    // Sign-in screen
    if (!firebaseUser) {
      return (
        <div
          className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-8 text-center"
          style={{
            paddingTop:    'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
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
                {isAuthLoading ? (
                  <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <img
                    src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                    alt="Google"
                    className="w-5 h-5"
                  />
                )}
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
              onClick={() => setIsDebugModalOpen(true)}
              className="mt-4 flex items-center gap-2 text-[10px] font-bold text-zinc-300 uppercase tracking-wider hover:text-zinc-500 transition-colors"
            >
              <Terminal size={12} />
              System Debugger
            </button>
          </div>
        </div>
      );
    }

    // Profile loading
    if (!user) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-zinc-50 p-6">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">
            Loading Profile…
          </p>
        </div>
      );
    }

    // ── Main app shell ──────────────────────────────────────────────────────
    // Points always come from Firestore-backed user object
    const safePoints = Math.max(0, Number(user.points ?? 0));
    const userWithSafePoints: UserProfile = { ...user, points: safePoints };

    return (
      <div className="h-screen flex flex-col bg-zinc-50 font-sans overflow-hidden">
        <div className="flex-1 overflow-y-auto scroll-smooth relative">
          <Header user={userWithSafePoints} />

          <main className="max-w-md mx-auto px-6 py-6 pb-[120px]">
            <AnimatePresence mode="wait">

              {/* ── Rewards tab ──────────────────────────────────────────── */}
              {activeTab === 'offers' && (
                <HomeScreen
                  user={userWithSafePoints}
                  offers={offers}
                  isLoading={isLoading}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  selectedCategory={selectedCategory}
                  setSelectedCategory={setSelectedCategory}
                  categories={categories}
                  filteredOffers={filteredOffers}
                  transactions={transactions}
                  handleWatchAd={() => setIsAdOpen(true)}
                  handleClaimOffer={handleClaimOffer}
                  handleClaimBoostReward={handleClaimBoostReward}
                />
              )}

              {/* ── History tab ───────────────────────────────────────────── */}
              {activeTab === 'history' && (
                <HistoryScreen transactions={transactions} />
              )}

              {/* ── Profile tab ───────────────────────────────────────────── */}
              {activeTab === 'profile' && (
                <ProfileScreen
                  user={userWithSafePoints}
                  claimsCount={transactions.filter((t) => t.type === 'claim').length}
                  onSignOut={handleSignOut}
                  onDeleteAccount={() => setIsDeleteModalOpen(true)}
                  onOpenPrivacy={() => setIsPrivacyModalOpen(true)}
                  onOpenDebug={() => setIsDebugModalOpen(true)}
                />
              )}

            </AnimatePresence>
          </main>
        </div>

        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* ── Boost Ad Modal ─────────────────────────────────────────────── */}
        <AdSimulatorModal
          isOpen={isAdOpen}
          onClose={() => setIsAdOpen(false)}
          onAdWatched={handleAdWatched}
          onClaim={handleClaimBoostReward}
          user={userWithSafePoints}
        />

        {/* ── Other modals ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {isPrivacyModalOpen && (
            <PrivacyModal
              isOpen={isPrivacyModalOpen}
              onClose={() => setIsPrivacyModalOpen(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isDeleteModalOpen && (
            <DeleteAccountModal
              isOpen={isDeleteModalOpen}
              onClose={() => setIsDeleteModalOpen(false)}
              onConfirm={handleDeleteAccount}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isConfirmModalOpen && (
            <ConfirmModal
              isOpen={isConfirmModalOpen}
              onClose={() => setIsConfirmModalOpen(false)}
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
        {isDebugModalOpen && (
          <DebugLogsModal
            isOpen={isDebugModalOpen}
            onClose={() => setIsDebugModalOpen(false)}
            logs={logs}
          />
        )}
      </AnimatePresence>
    </>
  );
}
