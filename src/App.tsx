import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Gift, 
  User, 
  LayoutDashboard, 
  PlayCircle, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  X,
  ChevronRight,
  ChevronDown,
  Zap,
  Search,
  History,
  Copy,
  ExternalLink,
  ShieldCheck,
  Trash2,
  Terminal
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

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Logo = ({ className }: { className?: string }) => (
  <div className={cn("relative w-full mx-auto group cursor-pointer", className)}>
    <img 
      src={icon} 
      alt={`${APP_NAME} Logo`} 
      className="w-full h-auto object-contain rounded-[2.5rem] shadow-2xl transition-transform group-hover:scale-105"
      referrerPolicy="no-referrer"
    />
  </div>
);

const Navbar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => {
  const tabs = [
    { id: 'offers', icon: LayoutDashboard, label: 'Rewards' },
    { id: 'profile', icon: User, label: 'Profile' },
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
              "flex flex-col items-center gap-1 transition-colors",
              activeTab === tab.id ? "text-indigo-600" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
            <span className="text-[10px] font-medium uppercase tracking-wider">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

const Header = ({ user }: { user: UserProfile }) => (
  <header 
    className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-zinc-100 px-5 pb-2 z-40"
    style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
  >
    <div className="max-w-md mx-auto flex justify-between items-center">
      <div className="flex items-center gap-3">
        <Logo className="max-w-[36px]" />
        <div>
          <h1 className="text-base font-black tracking-tight text-zinc-900 leading-none">{APP_NAME}</h1>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">Earn while you play</p>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 shadow-sm">
        <Zap size={14} className="text-indigo-600 fill-indigo-600" />
        <span className="text-sm font-bold text-indigo-700">{Math.max(0, Number(user.points || 0))} pts</span>
      </div>
    </div>
  </header>
);

const AdSimulatorModal = ({ 
  isOpen, 
  onClose, 
  onReward, 
  isBoost = false, 
  user = null, 
  onClaim = null 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onReward: () => Promise<any>, 
  isBoost?: boolean,
  user?: UserProfile | null,
  onClaim?: () => Promise<any>
}) => {
  const [timeLeft, setTimeLeft] = useState(5);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    setTimeLeft(5);
    setIsFinished(false);
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  // Version 8.0.0: Boost Logic
  const adsNeeded = user?.boostLevel || 1;
  const adsWatched = user?.currentLevelAdCounter || 0;
  const isLastAd = isBoost && (adsWatched + 1 >= adsNeeded);
  const canClaim = isBoost && isFinished && isLastAd;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm"
      style={{ 
        paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)'
      }}
    >
      <div className="w-full max-w-sm bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl">
        <div className="relative aspect-video bg-zinc-800 flex items-center justify-center">
          <PlayCircle size={48} className="text-zinc-600 animate-pulse" />
          <div className="absolute top-4 right-4 bg-black/50 px-3 py-1 rounded-full text-white text-xs font-bold">
            {isFinished ? 'Reward Ready!' : `Ad ends in ${timeLeft}s`}
          </div>
        </div>
        <div className="p-6 text-center">
          <h3 className="text-lg font-bold text-white mb-2">
            {isBoost ? `Daily Boost Level ${adsNeeded}` : 'Watching Sponsored Content'}
          </h3>
          <p className="text-sm text-zinc-400 mb-6">
            {isBoost 
              ? `Progress: ${adsWatched}/${adsNeeded} ads watched. ${isLastAd ? 'This is the final ad!' : 'Complete requirements to claim 100 points.'}`
              : 'Complete this short video to earn 100 points and unlock rewards.'}
          </p>
          
          <div className="flex flex-col gap-3">
            <button
              onClick={async () => {
                if (isFinished) {
                  if (isBoost) {
                    if (isLastAd) {
                      // Record last ad AND claim
                      await onReward();
                      if (onClaim) await onClaim();
                      onClose();
                    } else {
                      // Record current ad watch and start next one
                      await onReward();
                      setTimeLeft(5);
                      setIsFinished(false);
                    }
                  } else {
                    await onReward();
                    onClose();
                  }
                } else {
                  onClose();
                }
              }}
              className={cn(
                "w-full py-3 rounded-2xl font-bold transition-all",
                isFinished 
                  ? "bg-emerald-500 text-white hover:bg-emerald-600" 
                  : "bg-zinc-800 text-zinc-500"
              )}
            >
              {isFinished 
                ? (isLastAd ? 'Claim +100 Points' : (isBoost ? 'Watch Next Ad' : 'Claim Reward'))
                : 'Close Ad'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const DebugLogsModal = ({ isOpen, onClose, logs }: { isOpen: boolean, onClose: () => void, logs: any[] }) => {
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
            <p className="text-zinc-500 text-center py-10 italic">No logs captured yet.</p>
          ) : (
            [...logs].reverse().map((log) => (
              <div key={log.id} className={cn(
                "p-2 rounded border",
                log.level === 'error' ? "bg-rose-900/20 border-rose-900/50 text-rose-400" :
                log.level === 'reward' ? "bg-emerald-900/20 border-emerald-900/50 text-emerald-400" :
                "bg-zinc-800/50 border-zinc-700 text-zinc-400"
              )}>
                <div className="flex justify-between mb-1 opacity-50">
                  <span>{log.type.toUpperCase()}</span>
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

const PrivacyModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ 
        paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)'
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
          <div className="space-y-4 text-sm text-zinc-600 leading-relaxed max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
            <p className="font-bold text-zinc-900">Data Collection:</p>
            <p>We only collect your login information (email) to securely store and sync your earned points across devices.</p>
            
            <p className="font-bold text-zinc-900">Data Deletion & User Rights:</p>
            <p>We respect your privacy. You can delete your account and all associated data at any time directly through the "Delete Account" option in the app settings. Once you confirm deletion, all your personal information, including your email and earned points, will be permanently removed from our databases.</p>
            
            <p className="font-bold text-zinc-900">Third Parties & Ads:</p>
            <p>We do not sell your data or share it with third parties. Our app uses Google AdMob for advertisements, which may collect device identifiers and usage data for ad personalization and analytics.</p>
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

const DeleteAccountModal = ({ isOpen, onClose, onConfirm }: { isOpen: boolean, onClose: () => void, onConfirm: () => void }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{ 
        paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)'
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
          <p className="text-sm text-zinc-500 mb-8">This action is permanent. All your points and history will be deleted forever.</p>
          
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

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText, cancelText }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: () => void, 
  title: string, 
  message: string,
  confirmText?: string,
  cancelText?: string
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
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
            >
              {confirmText || 'Confirm'}
            </button>
            <button
              onClick={onClose}
              className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold hover:bg-zinc-200 transition-all active:scale-95"
            >
              {cancelText || 'Cancel'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// --- Main App ---

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

  useEffect(() => {
    const unsubscribeAuth = firebaseService.onAuthChange((fUser) => {
      setFirebaseUser(fUser);
      if (!fUser) {
        setIsAuthLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Real-time listeners for profile, claims, and history
  useEffect(() => {
    if (!firebaseUser?.uid) {
      setUser(null);
      setFirestoreClaims([]);
      setFirestoreHistory([]);
      return;
    }

    const uid = firebaseUser.uid;
    setIsAuthLoading(true);

    // Check for daily reset
    const isLocalGuest = uid.startsWith('local_guest_');
    if (isLocalGuest || (firebaseUser && !isAuthLoading)) {
      firebaseService.checkDailyReset(uid);
    }

    // Listen to profile changes in real-time
    const unsubscribeProfile = firebaseService.onProfileChange(uid, (profile) => {
      console.log(`[DEBUG] Profile change detected for ${uid}:`, JSON.stringify({
        points: profile?.points,
        boostLevel: profile?.boostLevel,
        adsWatchedToday: profile?.adsWatchedToday,
        currentLevelAdCounter: profile?.currentLevelAdCounter,
        lastBoostDate: profile?.lastBoostDate
      }));
      
      if (profile) {
        setUser(profile);
      } else {
        // Create profile if it doesn't exist
        console.log("[DEBUG] Profile not found, initializing for:", uid);
        const newProfile: UserProfile = {
          uid: uid,
          email: firebaseUser.email || (uid.startsWith('local_guest_') ? 'Guest User' : 'Unknown'),
          points: 0,
          claimsToday: 0,
          lastClaimDate: null,
          totalEarned: 0,
          boostLevel: 1,
          adsWatchedToday: 0,
          currentLevelAdCounter: 0,
          lastBoostDate: new Date().toDateString()
        };
        firebaseService.saveUserProfile(newProfile);
      }
      setIsAuthLoading(false);
    });

    // Listen to claims/transactions in real-time
    const unsubscribeClaims = firebaseService.onClaimsChange(uid, (claims) => {
      setFirestoreClaims(claims);
    });

    const unsubscribeHistory = firebaseService.onHistoryChange(uid, (history) => {
      setFirestoreHistory(history);
    });

    return () => {
      unsubscribeProfile();
      unsubscribeClaims();
      unsubscribeHistory();
    };
  }, [firebaseUser?.uid]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const categories = ['all', 'Fashion', 'Delivery apps', 'Shopping', 'Travel', 'Food', 'General'];
  
  const [isAdOpen, setIsAdOpen] = useState(false);
  const [isBoostAd, setIsBoostAd] = useState(false);
  
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('local_transactions');
    return saved ? JSON.parse(saved) : [];
  });
  const [firestoreClaims, setFirestoreClaims] = useState<Transaction[]>([]);
  const [firestoreHistory, setFirestoreHistory] = useState<Transaction[]>([]);

  const transactions = useMemo(() => {
    const all = [...localTransactions, ...firestoreClaims, ...firestoreHistory];
    // Remove duplicates by ID
    const unique = Array.from(new Map(all.map(tx => [tx.id, tx])).values());
    return unique.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [localTransactions, firestoreClaims, firestoreHistory]);

  useEffect(() => {
    localStorage.setItem('local_transactions', JSON.stringify(localTransactions.slice(0, 50)));
  }, [localTransactions]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('currentBoostProgress', JSON.stringify({
        adsWatchedToday: user.adsWatchedToday,
        boostLevel: user.boostLevel,
        currentLevelAdCounter: user.currentLevelAdCounter,
        lastBoostDate: user.lastBoostDate
      }));
    }
  }, [user]);

  const { logs, addLog, watchAd, claimBoostReward, offers, isLoading, onOffersChange } = useAds(firebaseUser?.uid);

  useEffect(() => {
    // Version 7.4.0: Listen to ALL offers in real-time
    const unsubscribe = onOffersChange();
    return () => unsubscribe();
  }, [onOffersChange]);

  // Filtered Offers (Client-Side Filtering)
  const filteredOffers = useMemo(() => {
    const result = offers.filter(offer => {
      // 1. Category Filter
      const selected = selectedCategory.toLowerCase();
      const matchesCategory = selected === 'all' || 
        (Array.isArray(offer.category) 
          ? offer.category.some(cat => String(cat).toLowerCase() === selected)
          : String(offer.category || '').toLowerCase() === selected);
      
      if (!matchesCategory) return false;

      // 2. Search Filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        offer.brand.toLowerCase().includes(searchLower) ||
        offer.description.toLowerCase().includes(searchLower) ||
        offer.type.toLowerCase().includes(searchLower);
      
      return matchesSearch;
    });
    
    console.log(`[DEBUG] Filtering: ${offers.length} total -> ${result.length} filtered (Category: ${selectedCategory}, Search: "${searchQuery}")`);
    return result;
  }, [offers, searchQuery, selectedCategory]);

  const displayPoints = useMemo(() => {
    const points = transactions.reduce((acc, tx) => {
      if (tx.type === 'earn') return acc + tx.amount;
      if (tx.type === 'claim') return acc - tx.amount;
      return acc;
    }, 0);
    return Math.max(0, Number(points || 0));
  }, [transactions]);

  // Simulate App Open Ad
  useEffect(() => {
    const showAppOpen = async () => {
      addLog('app_open', 'load');
      await new Promise(r => setTimeout(r, 800));
      addLog('app_open', 'show');
    };
    showAppOpen();
  }, []);

  const handleWatchAd = async (isBoost: boolean = false) => {
    setIsBoostAd(isBoost);
    addLog('rewarded', 'load');
    setIsAdOpen(true);
    addLog('rewarded', 'show');
  };

  const handleAdReward = async () => {
    try {
      const result = await watchAd();
      
      if (result) {
        addLog('rewarded', 'show', `Ad watched. Progress: ${result.adsWatchedToday}/${result.adsNeeded}`);
        Toast.show({ text: `Ad watched! (${result.adsWatchedToday}/${result.adsNeeded})`, duration: 'short' });

        if (result.isLocalGuest) {
          console.log("[DEBUG] Guest reward processed locally");
        }
      }
    } catch (error) {
      console.error("Failed to reward points:", error);
      Toast.show({ text: "Error rewarding points. Please try again.", duration: 'short' });
    }
  };

  const handleClaimBoostReward = async () => {
    try {
      const result = await claimBoostReward();
      if (result) {
        addLog('rewarded', 'reward', `Boost Level ${result.boostLevel - 1} completed! User earned 100 points.`);
        Toast.show({ text: `Congratulations! Boost Level ${result.boostLevel - 1} Completed! +100 pts`, duration: 'long' });
      }
    } catch (error) {
      console.error("Failed to claim boost reward:", error);
      Toast.show({ text: "Error claiming reward. Please try again.", duration: 'short' });
    }
  };

  const openPrivacyPolicy = () => {
    setIsPrivacyModalOpen(true);
  };

  const handleClaimOffer = async (offer: Offer, currentCost: number) => {
    if (!user) {
      console.warn("[DEBUG] handleClaimOffer called but no user found");
      return;
    }

    console.log(`[DEBUG] handleClaimOffer started for ${offer.brand} (Cost: ${currentCost}, User Points: ${user.points})`);

    // Check eligibility
    if (user.points < currentCost) {
      console.log("[DEBUG] Insufficient points for claim");
      addLog('rewarded', 'error', 'Insufficient points for claim');
      setConfirmConfig({
        title: 'Not Enough Points',
        message: `You need ${currentCost - user.points} more points. Would you like to watch a short ad to earn 100 points?`,
        onConfirm: handleWatchAd
      });
      setIsConfirmModalOpen(true);
      return;
    }

    try {
      console.log("[DEBUG] Calling firebaseService.claimOffer...");
      await firebaseService.claimOffer(user.uid, offer);
      console.log("[DEBUG] claimOffer success");
      
      addLog('banner', 'reward', `Successfully claimed ${offer.brand}`);
      
      if (!offer.code) {
        Browser.open({ url: offer.url });
      } else {
        setConfirmConfig({
          title: 'Success!',
          message: `Your code for ${offer.brand} is: ${offer.code}. It has been saved to your history.`,
          onConfirm: () => {
            Clipboard.write({ string: offer.code! });
            Toast.show({ text: 'Code copied!', duration: 'short' });
          }
        });
        setIsConfirmModalOpen(true);
      }
    } catch (error) {
      console.error("[DEBUG] Claim failed:", error);
      Toast.show({ text: "Failed to claim offer. Please try again.", duration: 'long' });
    }
  };

  const handleSignIn = async () => {
    console.log("[DEBUG] handleSignIn starting...");
    setIsAuthLoading(true);
    try {
      addLog('app_open', 'load', 'Starting Google Sign-In...');
      const userObj = await firebaseService.signInWithGoogle();
      if (userObj) {
        console.log("[DEBUG] Google Sign-In Success:", userObj.uid);
        setFirebaseUser(userObj);
        addLog('app_open', 'show', `Signed in as ${userObj.email}`);
        Toast.show({ text: "Signed in successfully!", duration: 'short' });
      } else {
        console.warn("[DEBUG] Google Sign-In result is null");
      }
    } catch (error) {
      console.error("[DEBUG] Sign in failed:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog('app_open', 'error', `Sign-in Error: ${errorMessage}`);
      Toast.show({ 
        text: `Google Sign-In failed: ${errorMessage.slice(0, 50)}...`, 
        duration: 'long' 
      });
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    setIsAuthLoading(true);
    addLog('app_open', 'load', 'Starting Guest Sign-In...');
    
    // Version 7.4.0: Prioritize Anonymous Sign-In to ensure proper Firestore permissions
    try {
      const fUser = await firebaseService.signInAnonymously();
      console.log("[DEBUG] Anonymous sign-in success", fUser.uid);
      setFirebaseUser(fUser);
      addLog('app_open', 'show', 'Guest Sign-In Success (Firebase)');
      
      // Check if we have a profile for this anonymous user
      const profile = await firebaseService.getUserProfile(fUser.uid);
      if (profile) {
        console.log("[DEBUG] Profile found for anonymous user");
        setUser(profile);
      }
    } catch (err) {
      console.error("Anonymous sign-in failed:", err);
      addLog('app_open', 'error', `Firebase Guest Sign-In failed: ${err instanceof Error ? err.message : String(err)}`);
      
      // Fallback to local guest ID if Firebase fails (offline mode)
      let localUid = localStorage.getItem('persistent_guest_id');
      if (!localUid) {
        localUid = 'local_guest_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('persistent_guest_id', localUid);
      }
      console.log("[DEBUG] Using local guest ID", localUid);

      const guestProfile: UserProfile = {
        uid: localUid,
        email: 'Guest User',
        points: 0,
        claimsToday: 0,
        lastClaimDate: null,
        totalEarned: 0,
      };

      setFirebaseUser({ uid: localUid, isAnonymous: true } as any);
      setUser(guestProfile);
      addLog('app_open', 'show', 'Guest Sign-In Success (Local Fallback)');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await firebaseService.logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setFirebaseUser(null);
      setUser(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    
    setIsAuthLoading(true);
    try {
      // 1. Delete Firestore data
      await firebaseService.deleteUserProfile(user.uid);
      
      // 2. Delete Auth account (if not a local guest)
      if (!user.uid.startsWith('local_guest_')) {
        await firebaseService.deleteAccount();
      }
      
      await Toast.show({ text: 'Account deleted successfully', duration: 'long' });
    } catch (error: any) {
      console.error("Delete account error:", error);
      if (error.code === 'auth/requires-recent-login') {
        Toast.show({ text: "Please sign out and sign in again before deleting your account.", duration: 'long' });
      } else {
        Toast.show({ text: "Failed to delete account. Please try again later.", duration: 'long' });
      }
    } finally {
      setFirebaseUser(null);
      setUser(null);
      setIsAuthLoading(false);
      setIsDeleteModalOpen(false);
    }
  };

  if (!isConfigValid) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle size={48} className="text-rose-500 mb-4" />
        <h1 className="text-xl font-bold text-zinc-900 mb-2">Configuration Error</h1>
        <p className="text-sm text-zinc-500 max-w-xs">
          Firebase configuration is missing. Please check your environment variables and restart the app.
        </p>
      </div>
    );
  }

  // Version 7.4.0: Refactored return to ensure DebugLogsModal is always available
  const renderMainContent = () => {
    if (isAuthLoading) {
      return (
        <div 
          className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center gap-6"
          style={{ 
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)'
          }}
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
          style={{ 
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)'
          }}
        >
          <div className="w-full max-w-sm flex flex-col items-center">
            <Logo className="max-w-[160px]" />
            <h1 className="text-3xl font-black tracking-tight text-zinc-900 mt-8 mb-3">Welcome to RewardHub</h1>
            <p className="text-sm text-zinc-500 mb-10 max-w-[280px]">Sign in with Google to start earning points and save your progress.</p>
            
            <div className="w-full space-y-4">
              <button 
                onClick={handleSignIn}
                disabled={isAuthLoading}
                className="w-full bg-white border border-zinc-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-sm hover:shadow-md transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isAuthLoading ? (
                  <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
                )}
                {isAuthLoading ? 'Signing in...' : 'Continue with Google'}
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

    if (!user) {
      return (
        <div className="h-screen flex flex-col items-center justify-center bg-zinc-50 p-6">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Loading Profile...</p>
        </div>
      );
    }

    return (
      <div className="h-screen flex flex-col bg-zinc-50 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden">
        <div className="flex-1 overflow-y-auto scroll-smooth relative">
          <Header user={{ ...user, points: Number(displayPoints || 0) }} />

          <main className="max-w-md mx-auto px-6 py-6 pb-[120px]">
            <AnimatePresence mode="wait">
              {activeTab === 'offers' && (
                <HomeScreen 
                  user={{ ...user, points: Number(displayPoints || 0) }}
                  offers={offers}
                  isLoading={isLoading}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  selectedCategory={selectedCategory}
                  setSelectedCategory={setSelectedCategory}
                  categories={categories}
                  filteredOffers={filteredOffers}
                  transactions={transactions}
                  handleWatchAd={() => handleWatchAd(true)}
                  handleClaimOffer={handleClaimOffer}
                  handleClaimBoostReward={handleClaimBoostReward}
                />
              )}

              {activeTab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm text-center">
                  <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <User size={40} className="text-indigo-600" />
                  </div>
                  <h2 className="text-xl font-bold text-zinc-900">{user.email}</h2>
                  <p className="text-xs text-zinc-500 font-medium">Member since {APP_VERSION}</p>
                  
                  <div className="grid grid-cols-2 gap-4 mt-8">
                    <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                      <span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">Total Points</span>
                      <span className="text-lg font-bold text-zinc-900">{Math.max(0, Number(displayPoints || 0))}</span>
                    </div>
                    <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                      <span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">Claims</span>
                      <span className="text-lg font-bold text-zinc-900">{transactions.filter(t => t.type === 'claim').length}</span>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-zinc-100">
                    <button 
                      onClick={() => setIsDebugModalOpen(true)}
                      className="w-full flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100 hover:bg-zinc-100 transition-colors group mt-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-zinc-200 shadow-sm">
                          <Terminal size={18} className="text-zinc-600" />
                        </div>
                        <div className="text-left">
                          <h4 className="text-sm font-bold text-zinc-900">System Debugger</h4>
                          <p className="text-[10px] text-zinc-400 font-medium">View logs and error details</p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                    </button>
                    <button 
                      onClick={openPrivacyPolicy}
                      className="w-full flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100 hover:bg-zinc-100 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-zinc-200 shadow-sm">
                          <ShieldCheck size={18} className="text-zinc-600" />
                        </div>
                        <div className="text-left">
                          <h4 className="text-sm font-bold text-zinc-900">Privacy Policy</h4>
                          <p className="text-[10px] text-zinc-400 font-medium">How we handle your data</p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-zinc-300 group-hover:text-zinc-500 transition-colors" />
                    </button>
                    <button 
                      onClick={handleSignOut}
                      className="w-full flex items-center justify-between p-4 bg-rose-50 rounded-2xl border border-rose-100 hover:bg-rose-100 transition-colors group mt-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-rose-200 shadow-sm">
                          <X size={18} className="text-rose-600" />
                        </div>
                        <div className="text-left">
                          <h4 className="text-sm font-bold text-rose-900">Sign Out</h4>
                          <p className="text-[10px] text-rose-400 font-medium">Log out of your account</p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-rose-300 group-hover:text-rose-500 transition-colors" />
                    </button>
                    <button 
                      onClick={() => setIsDeleteModalOpen(true)}
                      className="w-full flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100 hover:bg-rose-50 hover:border-rose-100 transition-colors group mt-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center border border-zinc-200 shadow-sm group-hover:border-rose-200">
                          <Trash2 size={18} className="text-zinc-400 group-hover:text-rose-600" />
                        </div>
                        <div className="text-left">
                          <h4 className="text-sm font-bold text-zinc-500 group-hover:text-rose-900">Delete Account</h4>
                          <p className="text-[10px] text-zinc-400 font-medium group-hover:text-rose-400">Permanently remove all data</p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-zinc-300 group-hover:text-rose-500 transition-colors" />
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-zinc-400 uppercase tracking-widest">
                    <History size={16} />
                    Activity History
                  </div>
                  {transactions.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 border border-dashed border-zinc-300 text-center">
                      <History size={24} className="text-zinc-300 mx-auto mb-2" />
                      <p className="text-xs text-zinc-400">No activity yet. Start earning!</p>
                    </div>
                  ) : (
                    transactions.map((tx) => (
                      <div key={tx.id} className="bg-white p-4 rounded-2xl border border-zinc-200 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            tx.type === 'earn' ? "bg-emerald-50" : "bg-indigo-50"
                          )}>
                            {tx.type === 'earn' ? (
                              <TrendingUp size={20} className="text-emerald-600" />
                            ) : (
                              <Gift size={20} className="text-indigo-600" />
                            )}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-zinc-900">{tx.title}</h4>
                            <p className="text-[10px] text-zinc-400">
                              {new Date(tx.timestamp).toLocaleDateString()} at {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1">
                          <span className={cn(
                            "block text-sm font-bold",
                            tx.type === 'earn' ? "text-emerald-600" : "text-rose-600"
                          )}>
                            {tx.type === 'earn' ? '+' : ''}{tx.amount} pts
                          </span>
                          {tx.code && (
                            tx.rewardType === 'link' ? (
                              <button 
                                onClick={async () => {
                                  try {
                                    await Browser.open({ url: tx.code! });
                                  } catch (error) {
                                    window.open(tx.code!, '_blank');
                                  }
                                }}
                                className="flex items-center gap-1 text-[10px] font-bold bg-indigo-600 px-2 py-0.5 rounded text-white border border-indigo-700 hover:bg-indigo-700 transition-colors"
                              >
                                Open Link
                                <ExternalLink size={10} />
                              </button>
                            ) : (
                              <button 
                                onClick={async () => {
                                  await Clipboard.write({ string: tx.code! });
                                  await Toast.show({ text: 'Code copied!', duration: 'short' });
                                }}
                                className="flex items-center gap-1 text-[10px] font-mono bg-zinc-100 px-2 py-0.5 rounded text-zinc-600 border border-zinc-200 hover:bg-zinc-200 transition-colors"
                              >
                                {tx.code}
                                <Copy size={10} />
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  
                  {/* Extra space at the bottom of the list to prevent overlap with Banner Ad and Navbar */}
                  <div className="h-40" />
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>

      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <AdSimulatorModal 
        isOpen={isAdOpen} 
        onClose={() => setIsAdOpen(false)} 
        onReward={handleAdReward}
        isBoost={isBoostAd}
        user={user}
        onClaim={handleClaimBoostReward}
      />

      <AnimatePresence>
        <PrivacyModal 
          isOpen={isPrivacyModalOpen} 
          onClose={() => setIsPrivacyModalOpen(false)} 
        />
      </AnimatePresence>

      <AnimatePresence>
        <DeleteAccountModal 
          isOpen={isDeleteModalOpen} 
          onClose={() => setIsDeleteModalOpen(false)} 
          onConfirm={handleDeleteAccount}
        />
      </AnimatePresence>
    </div>
    );
  };

  return (
    <>
      {renderMainContent()}
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
