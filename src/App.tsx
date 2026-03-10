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
  Ticket,
  Copy,
  Plus,
  Trash2,
  ExternalLink,
  Settings,
  Database,
  RefreshCw
} from 'lucide-react';
import { Clipboard } from '@capacitor/clipboard';
import { Toast } from '@capacitor/toast';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MOCK_OFFERS } from './constants';
import { Offer, UserProfile, AdLog, ClaimRecord, Transaction, Store, DiscountCode } from './types';
import { useAds } from './hooks/useAds';
import { firebaseService } from './services/firebase';
import { apiService } from './services/apiService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Navbar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => {
  const tabs = [
    { id: 'deals', icon: Ticket, label: 'Deals' },
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
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">RewardHub</h1>
        <p className="text-xs text-zinc-500 font-medium">Earn while you play</p>
      </div>
      <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
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

const DealCard = ({ deal }: { deal: DiscountCode, key?: string | number }) => {
  const handleCopy = async () => {
    await Clipboard.write({
      string: deal.code
    });
    await Toast.show({
      text: 'Code copied successfully!',
      duration: 'short',
      position: 'bottom'
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-2xl border border-zinc-200 p-4 shadow-sm hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-4 mb-3">
        <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center overflow-hidden border border-zinc-100">
          <img src={`https://logo.clearbit.com/${deal.storeName.toLowerCase().replace(/\s/g, '')}.com`} alt={deal.storeName} className="w-full h-full object-contain p-2" onError={(e) => { (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/store/100/100' }} />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-zinc-900">{deal.storeName}</h3>
          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
            {deal.isApiFetched ? 'Verified Deal' : 'Community Deal'}
          </span>
        </div>
      </div>
      
      <p className="text-sm text-zinc-600 mb-4 line-clamp-2">{deal.description}</p>
      
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-zinc-50 border border-dashed border-zinc-300 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span className="font-mono font-bold text-zinc-800 tracking-wider">{deal.code}</span>
          <button onClick={handleCopy} className="text-indigo-600 hover:text-indigo-700 transition-colors">
            <Copy size={18} />
          </button>
        </div>
        <a 
          href={deal.affiliateLink} 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-indigo-600 text-white p-2.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
        >
          <ExternalLink size={18} />
        </a>
      </div>
    </motion.div>
  );
};

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('offers');
  const [stores, setStores] = useState<Store[]>([]);
  const [deals, setDeals] = useState<DiscountCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  // Admin Form States
  const [newStore, setNewStore] = useState<Omit<Store, 'id' | 'createdAt' | 'updatedAt'>>({
    name: '',
    logoUrl: '',
    category: '',
    affiliateLink: ''
  });
  const [newDeal, setNewDeal] = useState<Omit<DiscountCode, 'id' | 'createdAt'>>({
    storeId: '',
    storeName: '',
    code: '',
    description: '',
    affiliateLink: '',
    expiryDate: '',
    isApiFetched: false
  });

  useEffect(() => {
    fetchData();
    
    // Daily Reset Simulation
    const lastReset = localStorage.getItem('last_daily_reset');
    const today = new Date().toDateString();
    
    if (lastReset !== today) {
      setBoostsClaimedToday(0);
      setAdWatchesForCurrentBoost(0);
      localStorage.setItem('last_daily_reset', today);
    }
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const fetchedStores = await firebaseService.getStores();
      const fetchedDeals = await firebaseService.getDiscountCodes();
      setStores(fetchedStores);
      setDeals(fetchedDeals);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const syncApiDeals = async () => {
    setIsLoading(true);
    try {
      const apiDeals = await apiService.fetchExternalDeals();
      for (const deal of apiDeals) {
        await firebaseService.addDiscountCode(deal);
      }
      await fetchData();
      alert('Successfully synced deals from APIs!');
    } catch (error) {
      console.error('Error syncing deals:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddStore = async () => {
    if (!newStore.name) return;
    await firebaseService.addStore(newStore as any);
    setNewStore({ name: '', logoUrl: '', category: '', affiliateLink: '' });
    await fetchData();
  };

  const handleAddDeal = async () => {
    if (!newDeal.code || !newDeal.storeId) return;
    const store = stores.find(s => s.id === newDeal.storeId);
    await firebaseService.addDiscountCode({
      ...newDeal,
      storeName: store?.name || 'Unknown Store',
    } as any);
    setNewDeal({ storeId: '', storeName: '', code: '', description: '', affiliateLink: '', expiryDate: '', isApiFetched: false });
    await fetchData();
  };

  const handleDeleteDeal = async (id: string) => {
    if (confirm('Are you sure you want to delete this deal?')) {
      await firebaseService.deleteDiscountCode(id);
      await fetchData();
    }
  };

  const handleDeleteStore = async (id: string) => {
    if (confirm('Are you sure you want to delete this store? All associated deals might become orphaned.')) {
      await firebaseService.deleteStore(id);
      await fetchData();
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState<UserProfile>({
    uid: 'user-123',
    email: 'demo@rewardhub.com',
    points: 5000, // Increased starting points for testing
    claimsToday: 0,
    lastClaimDate: null,
    totalEarned: 0,
  });
  
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

  // Filtered Offers
  const filteredOffers = useMemo(() => {
    return MOCK_OFFERS.filter(offer => 
      offer.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      offer.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      offer.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

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

  return (
    <div className="min-h-screen bg-zinc-50 pb-24 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <Header user={user} />

      <main className="max-w-md mx-auto px-6 py-6">
        <AnimatePresence mode="wait">
          {activeTab === 'deals' && (
            <motion.div
              key="deals"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-zinc-900">Today's Best Deals</h2>
                <button onClick={fetchData} className="p-2 text-zinc-400 hover:text-indigo-600 transition-colors">
                  <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                <input 
                  type="text"
                  placeholder="Search stores or codes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-zinc-200 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                />
              </div>

              {isLoading ? (
                <div className="grid gap-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-32 bg-zinc-100 animate-pulse rounded-2xl" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-4">
                  {deals.filter(d => d.storeName.toLowerCase().includes(searchQuery.toLowerCase()) || d.description.toLowerCase().includes(searchQuery.toLowerCase())).map((deal) => (
                    <DealCard key={deal.id} deal={deal} />
                  ))}
                  {deals.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-zinc-200">
                      <Ticket size={40} className="text-zinc-300 mx-auto mb-3" />
                      <p className="text-sm text-zinc-500">No deals found. Check back later!</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

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
                    {MOCK_OFFERS.length} Offers
                  </span>
                )}
              </div>

              <div className="grid gap-4">
                {filteredOffers.length > 0 ? (
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
                    <Search size={32} className="text-zinc-300 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-zinc-900 mb-1">No results found</h3>
                    <p className="text-xs text-zinc-500">Try searching for something else</p>
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
                              <Ticket size={14} className="text-indigo-600" />
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
                            <Ticket size={20} className="text-indigo-600" />
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
