import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Gift, 
  User, 
  LayoutDashboard, 
  Terminal, 
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
import { Offer, UserProfile, AdLog, ClaimRecord, Transaction } from './types';
import { useAds } from './hooks/useAds';
import { firebaseService, FirebaseUser } from './services/firebase';

import icon from '../assets/icon.png';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Logo = () => (
  <div className="relative w-16 h-16 group cursor-pointer mx-auto">
    <img 
      src={icon} 
      alt="RewardHub Logo" 
      className="w-full h-full object-contain rounded-[22%] shadow-[0_10px_25px_rgba(124,58,237,0.4)] transition-transform group-hover:scale-105"
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
          <h1 className="text-lg font-black tracking-tight text-zinc-900 leading-none">RewardHub</h1>
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

interface OfferCardProps {
  offer: Offer;
  onClaim: (offer: Offer, currentCost: number) => void;
  user: UserProfile;
  currentCost: number;
  isClaimedToday: boolean;
  claimedCode?: string;
  key?: string | number;
}

const OfferCard = ({ offer, onClaim, user, isClaimedToday, claimedCode }: OfferCardProps) => {
  const isLocked = user.points < offer.points && !isClaimedToday;
  
  const handleCopyCode = async () => {
    if (claimedCode || offer.code) {
      await Clipboard.write({ string: claimedCode || offer.code! });
      await Toast.show({ text: 'Code copied!', duration: 'short' });
    }
  };

  const handleGoToStore = async () => {
    try {
      await Browser.open({ url: offer.url });
    } catch (error) {
      window.open(offer.url, '_blank');
    }
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow relative"
    >
      {isClaimedToday && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-emerald-500 text-white px-2 py-1 rounded-lg font-bold text-[10px] shadow-lg uppercase tracking-wider">
          <CheckCircle2 size={12} />
          Unlocked
        </div>
      )}
      <div className="relative h-40 flex items-center justify-center bg-zinc-50">
        <img 
          src={offer.logoUrl} 
          alt={offer.brand} 
          className="w-full h-full object-contain p-4"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://cdn-icons-png.flaticon.com/512/1162/1162456.png';
          }}
        />
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide text-zinc-700 border border-white/20 shadow-sm">
          {offer.type}
        </div>
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-bold text-zinc-900 leading-tight">{offer.brand}</h3>
        </div>
        <p className="text-xs text-zinc-500 mb-4 line-clamp-2">{offer.description}</p>
        
        {isClaimedToday ? (
          <div className="space-y-3">
            {(claimedCode || offer.code) && (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-zinc-100 px-3 py-2 rounded-xl font-mono text-sm font-bold text-zinc-700 border border-zinc-200 truncate">
                  {claimedCode || offer.code}
                </div>
                <button 
                  onClick={handleCopyCode}
                  className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors"
                >
                  <Copy size={18} />
                </button>
              </div>
            )}
            <button
              onClick={handleGoToStore}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all"
            >
              <ExternalLink size={14} />
              Go to Store
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between mt-auto">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Cost</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-zinc-900">
                  {offer.points === 0 ? 'FREE' : `${offer.points.toLocaleString()} pts`}
                </span>
              </div>
            </div>
            <button
              onClick={() => onClaim(offer, offer.points)}
              disabled={isLocked}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                isLocked 
                  ? "bg-zinc-100 text-zinc-400 cursor-not-allowed" 
                  : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95"
              )}
            >
              {isLocked ? <Clock size={14} /> : <Zap size={14} />}
              {isLocked ? 'Locked' : 'Unlock'}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

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

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('offers');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

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
          setTransactions(claims);
        });

        return () => {
          unsubscribeProfile();
          unsubscribeClaims();
        };
      } else {
        setUser(null);
        setIsAuthLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const categories = ['All', 'Fashion', 'Delivery apps', "TV's", 'Shopping', 'Travel', 'Food'];
  
  const [adWatchesForCurrentBoost, setAdWatchesForCurrentBoost] = useState(0);
  const [boostsClaimedToday, setBoostsClaimedToday] = useState(0);
  const [isAdOpen, setIsAdOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { logs, addLog } = useAds();

  const adsNeededForNextBoost = useMemo(() => {
    if (boostsClaimedToday === 0) return 1;
    return boostsClaimedToday * 2;
  }, [boostsClaimedToday]);

  useEffect(() => {
    // Listen to offers in real-time
    const unsubscribeOffers = firebaseService.onOffersChange((data) => {
      setOffers(data);
      setIsLoading(false);
    });
    return () => unsubscribeOffers();
  }, []);

  useEffect(() => {
    // Daily Reset Simulation
    const lastReset = localStorage.getItem('last_daily_reset');
    const today = new Date().toDateString();
    
    if (lastReset !== today) {
      setBoostsClaimedToday(0);
      setAdWatchesForCurrentBoost(0);
      localStorage.setItem('last_daily_reset', today);
    }
  }, []);

  // Filtered Offers
  const filteredOffers = useMemo(() => {
    return offers.filter(offer => {
      const matchesSearch = offer.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        offer.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        offer.type.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = selectedCategory === 'All' || offer.category.includes(selectedCategory as any);
      
      return matchesSearch && matchesCategory;
    });
  }, [offers, searchQuery, selectedCategory]);

  // Simulate App Open Ad
  useEffect(() => {
    const showAppOpen = async () => {
      addLog('app_open', 'load');
      await new Promise(r => setTimeout(r, 800));
      addLog('app_open', 'show');
    };
    showAppOpen();
  }, []);

  const handleWatchAd = () => {
    addLog('rewarded', 'load');
    setIsAdOpen(true);
    addLog('rewarded', 'show');
  };

  const handleAdReward = async () => {
    const nextWatchCount = adWatchesForCurrentBoost + 1;
    
    if (nextWatchCount >= adsNeededForNextBoost) {
      if (user) {
        const newPoints = user.points + 100;
        await firebaseService.saveUserProfile({ ...user, points: newPoints });
        
        setBoostsClaimedToday(prev => prev + 1);
        setAdWatchesForCurrentBoost(0);
        
        const newTransaction: Transaction = {
          id: Math.random().toString(36).substr(2, 9),
          type: 'earn',
          title: 'Daily Boost Reward',
          amount: 100,
          timestamp: new Date().toISOString(),
        };
        setTransactions(prev => [newTransaction, ...prev]);
        
        addLog('rewarded', 'reward', `User earned 100 points (Boost #${boostsClaimedToday + 1})`);
        alert("Congratulations! You've earned 100 points!");
      }
    } else {
      setAdWatchesForCurrentBoost(nextWatchCount);
      addLog('rewarded', 'reward', `Ad watched (${nextWatchCount}/${adsNeededForNextBoost})`);
      alert(`Ad watched! Watch ${adsNeededForNextBoost - nextWatchCount} more to get your reward.`);
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
      const confirmAd = window.confirm(`Not enough points! You need ${currentCost - user.points} more points. Would you like to watch a short ad to earn 100 points?`);
      if (confirmAd) {
        handleWatchAd();
      }
      return;
    }

    try {
      await firebaseService.claimOffer(user.uid, offer);
      
      // Add local transaction for history (though real-time claims listener would be better)
      const newTransaction: Transaction = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'claim',
        title: offer.brand,
        amount: -currentCost,
        timestamp: new Date().toISOString(),
        code: offer.code,
        rewardType: offer.code ? 'code' : 'link',
      };

      setTransactions(prev => [newTransaction, ...prev]);
      addLog('banner', 'reward', `Successfully claimed ${offer.brand}`);
      
      if (!offer.code) {
        Browser.open({ url: offer.url });
      } else {
        alert(`Success! Your code for ${offer.brand} is: ${offer.code}. You can find it in your Profile history.`);
      }
    } catch (error) {
      console.error("Claim failed:", error);
      alert("Failed to claim offer. Please try again.");
    }
  };

  const handleSignIn = async () => {
    try {
      await firebaseService.signInWithGoogle();
    } catch (error) {
      console.error("Sign in failed:", error);
      alert("Google Sign-In failed. This is usually due to missing SHA-1 in Firebase for APKs. Try 'Continue as Guest' for testing.");
    }
  };

  const handleGuestSignIn = async () => {
    setIsAuthLoading(true);
    
    // Create local guest profile immediately
    const localUid = 'local_guest_' + Math.random().toString(36).substr(2, 9);
    const guestProfile: UserProfile = {
      uid: localUid,
      email: 'Guest User',
      points: 0,
      claimsToday: 0,
      lastClaimDate: null,
      totalEarned: 0,
    };

    // Set local state immediately to bypass Firebase hang
    setFirebaseUser({ uid: localUid, isAnonymous: true } as any);
    setUser(guestProfile);
    setIsAuthLoading(false);

    // Try to sign in anonymously in background, but don't wait for it
    firebaseService.signInAnonymously().catch(err => {
      console.warn("Background anonymous sign-in failed, staying in local guest mode:", err);
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
        alert("For security, please sign out and sign in again before deleting your account.");
      } else {
        alert("Failed to delete account. Please try again later.");
      }
    } finally {
      setFirebaseUser(null);
      setUser(null);
      setIsAuthLoading(false);
      setIsDeleteModalOpen(false);
    }
  };

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
        className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center"
        style={{ 
          paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)'
        }}
      >
        <Logo />
        <h1 className="text-2xl font-black tracking-tight text-zinc-900 mt-6 mb-2">Welcome to RewardHub</h1>
        <p className="text-sm text-zinc-500 mb-8 max-w-xs">Sign in with Google to start earning points and save your progress.</p>
        <button 
          onClick={handleSignIn}
          className="w-full max-w-xs bg-white border border-zinc-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-sm hover:shadow-md transition-all active:scale-95 mb-3"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
          Continue with Google
        </button>

        <button 
          onClick={handleGuestSignIn}
          className="w-full max-w-xs bg-zinc-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-zinc-200 hover:bg-zinc-800 transition-all active:scale-95"
        >
          <User size={20} />
          Continue as Guest
        </button>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div 
      className="min-h-screen bg-zinc-50 font-sans selection:bg-indigo-100 selection:text-indigo-900"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}
    >
      <Header user={user} />

      <main className="max-w-md mx-auto px-6 py-6">
        <AnimatePresence mode="wait">
          {activeTab === 'offers' && (
            <motion.div
              key="offers"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-6"
            >
              {/* Search Bar */}
              <div className="space-y-4">
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                  <input 
                    type="text"
                    placeholder="Search coupons, brands, or types..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-zinc-200 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                  />
                </div>

                {/* Categories Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Categories</label>
                  <div className="relative">
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full bg-white border border-zinc-200 rounded-2xl py-3.5 pl-4 pr-10 text-sm font-bold text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                      <ChevronDown size={18} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Daily Task Card */}
              <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200 overflow-hidden relative">
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-1">
                    <h2 className="text-lg font-bold">Daily Boost</h2>
                    <span className="bg-white/20 backdrop-blur px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                      {boostsClaimedToday > 0 ? `Boost #${boostsClaimedToday + 1}` : 'First Boost'}
                    </span>
                  </div>
                  <p className="text-indigo-100 text-xs mb-4">
                    {adWatchesForCurrentBoost > 0 
                      ? `Progress: ${adWatchesForCurrentBoost}/${adsNeededForNextBoost} ads watched`
                      : `Watch ${adsNeededForNextBoost} ${adsNeededForNextBoost === 1 ? 'ad' : 'ads'} to get +100 points!`}
                  </p>
                  
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={handleWatchAd}
                      className="bg-white text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-50 transition-colors"
                    >
                      <PlayCircle size={16} />
                      Watch Now
                    </button>
                    
                    {adsNeededForNextBoost > 1 && (
                      <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(adWatchesForCurrentBoost / adsNeededForNextBoost) * 100}%` }}
                          className="h-full bg-white"
                        />
                      </div>
                    )}
                  </div>
                </div>
                <TrendingUp className="absolute -bottom-4 -right-4 text-white/10 w-32 h-32" />
              </div>

              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">
                  {searchQuery ? `Search Results (${filteredOffers.length})` : 'Available Rewards'}
                </h2>
                {!searchQuery && (
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {offers.length} Offers
                  </span>
                )}
              </div>

              <div className="grid gap-4">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 space-y-4">
                    <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Loading Rewards...</p>
                  </div>
                ) : filteredOffers.length > 0 ? (
                  filteredOffers.map((offer) => {
                    const claimsTodayForThisOffer = transactions.filter(t => 
                      t.type === 'claim' &&
                      t.title === offer.title &&
                      new Date(t.timestamp).toDateString() === new Date().toDateString()
                    ).length;
                    const currentCost = offer.pointsRequired * Math.pow(2, claimsTodayForThisOffer);
                    const isClaimedToday = claimsTodayForThisOffer > 0;

                    return (
                      <OfferCard 
                        key={offer.id} 
                        offer={offer} 
                        onClaim={handleClaimOffer} 
                        user={user} 
                        currentCost={offer.points}
                        isClaimedToday={isClaimedToday}
                        claimedCode={isClaimedToday ? (transactions.find(t => t.title === offer.brand)?.code) : undefined}
                      />
                    );
                  })
                ) : (
                  <div className="bg-white rounded-3xl p-12 border border-dashed border-zinc-200 text-center">
                    <Gift size={32} className="text-zinc-300 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-zinc-900 mb-1">More rewards coming soon!</h3>
                    <p className="text-xs text-zinc-500">We're working on bringing you the best deals.</p>
                  </div>
                )}
              </div>

              {/* Recent Activity Mini-Section */}
              {transactions.length > 0 && (
                <div className="space-y-3 pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Recent Activity</h3>
                    <button 
                      onClick={() => setActiveTab('profile')}
                      className="text-[10px] font-bold text-indigo-600 hover:underline"
                    >
                      View All
                    </button>
                  </div>
                  <div className="space-y-2">
                    {transactions.slice(0, 2).map((tx) => (
                      <div key={tx.id} className="bg-white p-3 rounded-xl border border-zinc-100 flex items-center justify-between shadow-sm">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center",
                            tx.type === 'earn' ? "bg-emerald-50" : "bg-indigo-50"
                          )}>
                            {tx.type === 'earn' ? (
                              <TrendingUp size={14} className="text-emerald-600" />
                            ) : (
                              <Gift size={14} className="text-indigo-600" />
                            )}
                          </div>
                          <div>
                            <h4 className="text-[11px] font-bold text-zinc-900">{tx.title}</h4>
                            <p className="text-[9px] text-zinc-400">{new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                        </div>
                        <span className={cn(
                          "text-xs font-bold",
                          tx.type === 'earn' ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {tx.type === 'earn' ? '+' : ''}{tx.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
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
                <p className="text-xs text-zinc-500 font-medium">Member since Feb 2026</p>
                
                <div className="grid grid-cols-2 gap-4 mt-8">
                  <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">Total Points</span>
                    <span className="text-lg font-bold text-zinc-900">{user.points}</span>
                  </div>
                  <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <span className="block text-[10px] uppercase font-bold text-zinc-400 tracking-wider mb-1">Claims</span>
                    <span className="text-lg font-bold text-zinc-900">{user.totalEarned}</span>
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
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

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
      <div className="fixed bottom-20 left-0 right-0 px-6 pointer-events-none">
        <div className="max-w-md mx-auto bg-zinc-100 border border-zinc-200 h-12 rounded-lg flex items-center justify-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest pointer-events-auto">
          Sponsored Banner Ad
        </div>
      </div>
    </div>
  );
}
