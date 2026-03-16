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
  Zap,
  Search,
  History,
  Copy,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { Clipboard } from '@capacitor/clipboard';
import { Toast } from '@capacitor/toast';
import { Browser } from '@capacitor/browser';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Offer, UserProfile, AdLog, ClaimRecord, Transaction } from './types';
import { useAds } from './hooks/useAds';
import { firebaseService, FirebaseUser } from './services/firebase';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Logo = () => (
  <div className="relative w-10 h-10 group cursor-pointer">
    {/* Main Body with 3D depth and gradients */}
    <div className="absolute inset-0 bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-900 rounded-xl shadow-[0_4px_12px_rgba(79,70,229,0.5),inset_0_1px_2px_rgba(255,255,255,0.4)] transition-all duration-300 group-hover:scale-105 group-hover:rotate-3 active:scale-95" />
    
    {/* Glossy Overlay */}
    <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/20 rounded-xl pointer-events-none" />
    
    {/* Stylized R with shadow */}
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="text-white font-black text-2xl italic tracking-tighter drop-shadow-[0_3px_2px_rgba(0,0,0,0.4)] select-none transform -translate-y-0.5">R</span>
    </div>
    
    {/* Golden Shining Coin - 3D Style */}
    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-gradient-to-b from-yellow-200 via-amber-400 to-amber-700 rounded-full border-2 border-purple-900 shadow-[0_2px_6px_rgba(0,0,0,0.3)] flex items-center justify-center overflow-hidden">
      {/* Coin Shimmer */}
      <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.6)_50%,transparent_75%)] bg-[length:250%_250%] animate-[shimmer_3s_infinite]" />
      
      {/* Coin Detail */}
      <div className="relative w-3.5 h-3.5 border border-amber-200/50 rounded-full flex items-center justify-center">
        <div className="w-1.5 h-1.5 bg-white rounded-full blur-[1px] opacity-80" />
      </div>
    </div>
  </div>
);

const Navbar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => {
  const tabs = [
    { id: 'offers', icon: LayoutDashboard, label: 'Rewards' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-6 py-3 z-50">
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
  <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-zinc-100 px-6 py-4 z-40">
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
  key?: string | number;
}

const OfferCard = ({ offer, onClaim, user, currentCost, isClaimedToday }: OfferCardProps & { isClaimedToday: boolean }) => {
  const isLocked = user.points < currentCost;
  
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
          Claimed
        </div>
      )}
      <div className="relative h-40">
        <img 
          src={offer.imageUrl} 
          alt={offer.title} 
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide text-zinc-700 border border-white/20 shadow-sm">
          {offer.type}
        </div>
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-bold text-zinc-900 leading-tight">{offer.title}</h3>
          {currentCost > offer.pointsRequired && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
              Cost Doubled
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 mb-4 line-clamp-2">{offer.description}</p>
        
        <div className="flex items-center justify-between mt-auto">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Cost</span>
            <div className="flex items-center gap-1.5">
              <span className={cn(
                "text-sm font-bold",
                currentCost > offer.pointsRequired ? "text-amber-600" : "text-zinc-900"
              )}>
                {currentCost} pts
              </span>
              {currentCost > offer.pointsRequired && (
                <span className="text-[10px] text-zinc-400 line-through decoration-zinc-300">
                  {offer.pointsRequired}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => onClaim(offer, currentCost)}
            disabled={isLocked}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
              isLocked 
                ? "bg-zinc-100 text-zinc-400 cursor-not-allowed" 
                : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95"
            )}
          >
            {isLocked ? <Clock size={14} /> : <Gift size={14} />}
            {isLocked ? 'Locked' : 'Claim'}
          </button>
        </div>
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm">
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

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('offers');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    // Safety timeout: if auth takes too long, stop loading
    const timeout = setTimeout(() => {
      if (isAuthLoading) {
        console.warn("Auth loading timed out");
        setIsAuthLoading(false);
      }
    }, 5000);

    const unsubscribe = firebaseService.onAuthChange(async (fUser) => {
      try {
        setFirebaseUser(fUser);
        if (fUser) {
          const profile = await firebaseService.getUserProfile(fUser.uid);
          if (profile) {
            setUser(profile);
          } else {
            const newProfile: UserProfile = {
              uid: fUser.uid,
              email: fUser.email || '',
              points: 0,
              claimsToday: 0,
              lastClaimDate: null,
              totalEarned: 0,
            };
            await firebaseService.saveUserProfile(newProfile);
            setUser(newProfile);
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error("Error in auth change handler:", error);
      } finally {
        setIsAuthLoading(false);
        clearTimeout(timeout);
      }
    });

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (user) {
      firebaseService.saveUserProfile(user);
    }
  }, [user]);

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

  const [searchQuery, setSearchQuery] = useState('');
  
  // Progressive Ad State
  const [adWatchesForCurrentBoost, setAdWatchesForCurrentBoost] = useState(0);
  const [boostsClaimedToday, setBoostsClaimedToday] = useState(0);
  
  const adsNeededForNextBoost = useMemo(() => {
    if (boostsClaimedToday === 0) return 1;
    return boostsClaimedToday * 2;
  }, [boostsClaimedToday]);

  const [isAdOpen, setIsAdOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const { logs, addLog } = useAds();

  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchOffers = async () => {
      setIsLoading(true);
      const data = await firebaseService.getOffers();
      setOffers(data);
      setIsLoading(false);
    };
    fetchOffers();
  }, []);

  // Filtered Offers
  const filteredOffers = useMemo(() => {
    return offers.filter(offer => 
      offer.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      offer.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      offer.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [offers, searchQuery]);

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

  const handleAdReward = () => {
    const nextWatchCount = adWatchesForCurrentBoost + 1;
    
    if (nextWatchCount >= adsNeededForNextBoost) {
      setUser(prev => ({ ...prev, points: prev.points + 100 }));
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
    } else {
      setAdWatchesForCurrentBoost(nextWatchCount);
      addLog('rewarded', 'reward', `Ad watched (${nextWatchCount}/${adsNeededForNextBoost})`);
      alert(`Ad watched! Watch ${adsNeededForNextBoost - nextWatchCount} more to get your reward.`);
    }
  };

  const openPrivacyPolicy = async () => {
    try {
      await Browser.open({ url: 'https://docs.google.com/document/d/1D3u9UqwckecjQsdylWgCgMKaYhRu9FFMaAXNWKKCH5I/edit?usp=sharing' });
    } catch (error) {
      console.error('Error opening privacy policy:', error);
      await Toast.show({ text: 'Could not open privacy policy link' });
    }
  };

  const handleClaimOffer = (offer: Offer, currentCost: number) => {
    // Check eligibility
    if (user.points < currentCost) {
      alert(`Not enough points! You need ${currentCost - user.points} more points to claim this.`);
      return;
    }

    const claimsTodayForOffer = transactions.filter(t => 
      t.type === 'claim' && 
      t.title === offer.title &&
      new Date(t.timestamp).toDateString() === new Date().toDateString()
    ).length;

    if (claimsTodayForOffer >= 2) { // Limit to 2 claims per day
      alert(`Daily limit reached for ${offer.title}. You can claim each offer up to 2 times per day.`);
      addLog('banner', 'error', `Daily limit reached for offer ${offer.id}`);
      return;
    }

    const newTransaction: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      type: 'claim',
      title: offer.title,
      amount: -currentCost,
      timestamp: new Date().toISOString(),
      code: offer.reward,
      rewardType: offer.rewardType,
    };

    setTransactions(prev => [newTransaction, ...prev]);
    setUser(prev => ({
      ...prev,
      points: prev.points - currentCost,
      claimsToday: prev.claimsToday + 1,
      totalEarned: prev.totalEarned + 1,
    }));
    
    addLog('banner', 'reward', `Claimed ${offer.title} for ${currentCost} pts. Next claim will cost ${currentCost * 2} pts.`);
    
    if (offer.rewardType === 'link') {
      alert(`Success! Click "Open Link" in your Profile history to activate your reward.`);
    } else {
      alert(`Success! Your code for ${offer.title} is: ${offer.reward}. You can find it in your Profile history.`);
    }
  };

  const handleSignIn = async () => {
    try {
      await firebaseService.signInWithGoogle();
    } catch (error) {
      console.error("Sign in failed:", error);
      alert("Sign in failed. Please try again.");
    }
  };

  const handleSignOut = async () => {
    await firebaseService.logout();
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 text-center">
        <Logo />
        <h1 className="text-2xl font-black tracking-tight text-zinc-900 mt-6 mb-2">Welcome to RewardHub</h1>
        <p className="text-sm text-zinc-500 mb-8 max-w-xs">Sign in with Google to start earning points and save your progress.</p>
        <button 
          onClick={handleSignIn}
          className="w-full max-w-xs bg-white border border-zinc-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-sm hover:shadow-md transition-all active:scale-95"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
          Continue with Google
        </button>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-zinc-50 pb-24 font-sans selection:bg-indigo-100 selection:text-indigo-900">
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
                        currentCost={currentCost}
                        isClaimedToday={isClaimedToday}
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
                            <a 
                              href={tx.code}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[10px] font-bold bg-indigo-600 px-2 py-0.5 rounded text-white border border-indigo-700 hover:bg-indigo-700 transition-colors"
                            >
                              Open Link
                              <ExternalLink size={10} />
                            </a>
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

      {/* Simulated Banner Ad */}
      <div className="fixed bottom-20 left-0 right-0 px-6 pointer-events-none">
        <div className="max-w-md mx-auto bg-zinc-100 border border-zinc-200 h-12 rounded-lg flex items-center justify-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest pointer-events-auto">
          Sponsored Banner Ad
        </div>
      </div>
    </div>
  );
}
