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
  Trash2
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

const Logo = () => (
  <div className="relative w-32 h-32 mx-auto group cursor-pointer">
    <img 
      src={icon} 
      alt={`${APP_NAME} Logo`} 
      className="w-full h-full object-contain rounded-[2.5rem] shadow-2xl transition-transform group-hover:scale-105"
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
    className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-zinc-100 px-6 pb-4 z-40"
    style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}
  >
    <div className="max-w-md mx-auto flex justify-between items-center">
      <div className="flex items-center gap-3">
        <Logo />
        <div>
          <h1 className="text-lg font-black tracking-tight text-zinc-900 leading-none">{APP_NAME}</h1>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">Earn while you play</p>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 shadow-sm">
        <Zap size={14} className="text-indigo-600 fill-indigo-600" />
        <span className="text-sm font-bold text-indigo-700">{user.points} pts</span>
      </div>
    </div>
  </header>
);

const AdSimulatorModal = ({ isOpen, onClose, onReward }: { isOpen: boolean, onClose: () => void, onReward: () => void }) => {
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
          <h3 className="text-lg font-bold text-white mb-2">Watching Sponsored Content</h3>
          <p className="text-sm text-zinc-400 mb-6">Complete this short video to earn 100 points and unlock rewards.</p>
          
          <button
            onClick={() => {
              if (isFinished) {
                onReward();
                onClose();
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
            {isFinished ? 'Claim Reward' : 'Close Ad'}
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
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ title: '', message: '', onConfirm: () => {} });

  useEffect(() => {
    const unsubscribeAuth = firebaseService.onAuthChange(async (fUser) => {
      setFirebaseUser(fUser);
      if (fUser) {
        // Listen to profile changes in real-time
        const unsubscribeProfile = firebaseService.onProfileChange(fUser.uid, (profile) => {
          if (profile) {
            setUser(profile);
          } else {
            // Create profile if it doesn't exist
            const newProfile: UserProfile = {
              uid: fUser.uid,
              email: fUser.email || '',
              points: 0,
              claimsToday: 0,
              lastClaimDate: null,
              totalEarned: 0,
            };
            firebaseService.saveUserProfile(newProfile);
          }
          setIsAuthLoading(false);
        });

        // Listen to claims/transactions in real-time
        const unsubscribeClaims = firebaseService.onClaimsChange(fUser.uid, (claims) => {
          setFirestoreClaims(claims);
        });

        const unsubscribeHistory = firebaseService.onHistoryChange(fUser.uid, (history) => {
          setFirestoreHistory(history);
        });

        return () => {
          unsubscribeProfile();
          unsubscribeClaims();
          unsubscribeHistory();
        };
      } else {
        setUser(null);
        setIsAuthLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const categories = ['all', 'fashion', 'delivery', 'shopping', 'travel', 'food'];
  
  const [isAdOpen, setIsAdOpen] = useState(false);
  
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

  const { logs, addLog, watchAd, offers, isLoading, onOffersChange } = useAds(user?.uid);

  useEffect(() => {
    // Listen to offers in real-time
    const unsubscribe = onOffersChange(selectedCategory);
    return () => unsubscribe();
  }, [selectedCategory, onOffersChange]);

  // Filtered Offers
  const filteredOffers = useMemo(() => {
    return offers.filter(offer => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        offer.brand.toLowerCase().includes(searchLower) ||
        offer.description.toLowerCase().includes(searchLower) ||
        offer.type.toLowerCase().includes(searchLower);
      
      return matchesSearch;
    });
  }, [offers, searchQuery]);

  const displayPoints = useMemo(() => {
    return transactions.reduce((acc, tx) => {
      if (tx.type === 'earn') return acc + tx.amount;
      if (tx.type === 'claim') return acc - tx.amount;
      return acc;
    }, 0);
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

  const handleWatchAd = async () => {
    addLog('rewarded', 'load');
    setIsAdOpen(true);
    addLog('rewarded', 'show');
  };

  const handleAdReward = async () => {
    try {
      const result = await watchAd();
      
      if (result) {
        if (result.rewardClaimed) {
          addLog('rewarded', 'reward', `User earned 100 points (Boost Level ${result.boostLevel - 1} completed)`);
          Toast.show({ text: "Congratulations! You've earned 100 points!", duration: 'long' });
        } else {
          addLog('rewarded', 'reward', `Ad watched (${result.adsWatchedToday}/${result.adsNeeded})`);
          Toast.show({ text: `Ad watched! Watch ${result.adsNeeded - result.adsWatchedToday} more to get your reward.`, duration: 'short' });
        }
      }
    } catch (error) {
      console.error("Failed to reward points:", error);
      Toast.show({ text: "Error rewarding points. Please try again.", duration: 'short' });
    }
  };

  const openPrivacyPolicy = () => {
    setIsPrivacyModalOpen(true);
  };

  const handleClaimOffer = async (offer: Offer, currentCost: number) => {
    if (!user) return;

    // Check eligibility
    if (user.points < currentCost) {
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
      await firebaseService.claimOffer(user.uid, offer);
      
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
      console.error("Claim failed:", error);
      Toast.show({ text: "Failed to claim offer. Please try again.", duration: 'long' });
    }
  };

  const handleSignIn = async () => {
    try {
      await firebaseService.signInWithGoogle();
    } catch (error) {
      console.error("Sign in failed:", error);
      Toast.show({ 
        text: "Google Sign-In failed. Please try 'Continue as Guest' if you are testing on an APK.", 
        duration: 'long' 
      });
    }
  };

  const handleGuestSignIn = async () => {
    setIsAuthLoading(true);
    
    // Get or create persistent local guest ID
    let localUid = localStorage.getItem('persistent_guest_id');
    if (!localUid) {
      localUid = 'local_guest_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('persistent_guest_id', localUid);
    }

    const guestProfile: UserProfile = {
      uid: localUid,
      email: 'Guest User',
      points: 0,
      claimsToday: 0,
      lastClaimDate: null,
      totalEarned: 0,
    };

    // Set local state immediately
    setFirebaseUser({ uid: localUid, isAnonymous: true } as any);
    setUser(guestProfile);
    setIsAuthLoading(false);

    // Save to Firestore 'guests' collection to ensure points are persistent
    try {
      await firebaseService.saveUserProfile(guestProfile);
    } catch (err) {
      console.warn("Failed to save guest profile to Firestore:", err);
    }

    // Try to sign in anonymously in background
    firebaseService.signInAnonymously().catch(err => {
      console.warn("Background anonymous sign-in failed:", err);
    });
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

  if (isAuthLoading) {
    return (
      <div 
        className="min-h-screen bg-zinc-50 flex items-center justify-center"
        style={{ 
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)'
        }}
      >
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
          <Logo />
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
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="h-screen flex flex-col bg-zinc-50 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden">
      <div className="flex-1 overflow-y-auto scroll-smooth relative">
        <Header user={{ ...user, points: displayPoints }} />

        <main className="max-w-md mx-auto px-6 py-6 pb-48">
          <AnimatePresence mode="wait">
            {activeTab === 'offers' && (
              <HomeScreen 
                user={user}
                offers={offers}
                isLoading={isLoading}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                categories={categories}
                filteredOffers={filteredOffers}
                transactions={transactions}
                handleWatchAd={handleWatchAd}
                handleClaimOffer={handleClaimOffer}
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
                    <span className="text-lg font-bold text-zinc-900">{displayPoints}</span>
                  </div>
                  <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">Claims</span>
                    <span className="text-lg font-bold text-zinc-900">{transactions.filter(t => t.type === 'claim').length}</span>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-zinc-100">
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

    {/* Simulated Banner Ad */}
    <div className="fixed bottom-20 left-0 right-0 px-6 pointer-events-none z-30">
      <div className="max-w-md mx-auto bg-zinc-100/90 backdrop-blur-sm border border-zinc-200 h-12 rounded-lg flex items-center justify-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest pointer-events-auto shadow-sm">
        Sponsored Banner Ad
      </div>
    </div>
  </div>
);
}
