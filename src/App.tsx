import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap,
  LayoutDashboard,
  User,
  Terminal,
  PlayCircle
} from 'lucide-react';
import { Toast } from '@capacitor/toast';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// استيراد الأنواع والخدمات
import { UserProfile, Transaction } from './types';
import { useAds } from './hooks/useAds';
import { firebaseService, FirebaseUser, isConfigValid } from './services/firebase';
import { APP_NAME, APP_VERSION } from './constants';

// استيراد المكونات من مجلد components
import { HomeScreen } from './components/HomeScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { HistoryScreen } from './components/HistoryScreen';

import icon from '../assets/icon.png';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- المكونات المساعدة ---

const Logo = ({ className }: { className?: string }) => (
  <div className={cn("relative w-full mx-auto group cursor-pointer", className)}>
    <img src={icon} alt={`${APP_NAME} Logo`} className="w-full h-auto object-contain rounded-[2.5rem] shadow-2xl transition-transform group-hover:scale-105" />
  </div>
);

const Navbar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (tab: string) => void }) => {
  const tabs = [
    { id: 'offers', icon: LayoutDashboard, label: 'Rewards' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-6 pt-3 z-50 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="max-w-md mx-auto flex justify-between items-center">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === tab.id ? "text-indigo-600" : "text-zinc-400 hover:text-zinc-600")}>
            <tab.icon size={20} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
            <span className="text-[10px] font-medium uppercase tracking-wider">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

const Header = ({ points }: { points: number }) => (
  <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-zinc-100 px-5 pb-2 z-40 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
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
        <span className="text-sm font-bold text-indigo-700">{Math.max(0, points)} pts</span>
      </div>
    </div>
  </header>
);

// --- التطبيق الرئيسي ---

export default function App() {
  const [activeTab, setActiveTab] = useState('offers');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
  const [isAdOpen, setIsAdOpen] = useState(false);
  const [isBoostAd, setIsBoostAd] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // 1. مراقبة حالة تسجيل الدخول
  useEffect(() => {
    return firebaseService.onAuthChange((fUser) => {
      setFirebaseUser(fUser);
      if (!fUser) setIsAuthLoading(false);
    });
  }, []);

  // 2. مزامنة البيانات الحية (Real-time Sync)
  useEffect(() => {
    if (!firebaseUser?.uid) return;
    const uid = firebaseUser.uid;

    firebaseService.checkDailyReset(uid);

    const unsubProfile = firebaseService.onProfileChange(uid, (profile) => {
      if (profile) setUser(profile);
      setIsAuthLoading(false);
    });

    const unsubHistory = firebaseService.onHistoryChange(uid, (history) => {
      setTransactions(history);
    });

    return () => { unsubProfile(); unsubHistory(); };
  }, [firebaseUser?.uid]);

  const { logs, watchAd, claimBoostReward, offers, isLoading } = useAds(firebaseUser?.uid);

  // حساب النقاط بطريقة آمنة
  const displayPoints = useMemo(() => Math.max(0, Number(user?.points || 0)), [user?.points]);

  const handleWatchAd = async (isBoost: boolean = false) => {
    setIsBoostAd(isBoost);
    setIsAdOpen(true);
  };

  const handleSignIn = async () => {
    setIsAuthLoading(true);
    try {
      await firebaseService.signInWithGoogle();
    } catch (error) {
      console.error("Sign in failed", error);
      Toast.show({ text: "Login failed. Check SHA-1/API Key.", duration: 'long' });
    } finally { setIsAuthLoading(false); }
  };

  if (!isConfigValid) return <div className="p-10 text-center">Firebase Config Error</div>;

  if (isAuthLoading) return <div className="h-screen flex items-center justify-center"><div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;

  if (!firebaseUser) {
    return (
      <div className="h-screen bg-zinc-50 flex flex-col items-center justify-center p-8 text-center">
        <Logo className="max-w-[160px]" />
        <h1 className="text-3xl font-black text-zinc-900 mt-8 mb-3">Welcome to RewardHub</h1>
        <button onClick={handleSignIn} className="w-full max-w-xs bg-white border border-zinc-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-sm active:scale-95">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="w-5 h-5" />
          Continue with Google
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-50 overflow-hidden">
      <Header points={displayPoints} />
      
      <main className="flex-1 overflow-y-auto px-6 py-6 pb-32">
        <AnimatePresence mode="wait">
          {activeTab === 'offers' ? (
            <HomeScreen 
              user={user!} 
              offers={offers} 
              isLoading={isLoading} 
              transactions={transactions}
              handleWatchAd={() => handleWatchAd(true)} 
              handleClaimOffer={async (offer) => await firebaseService.claimOffer(user!.uid, offer)}
              handleClaimBoostReward={claimBoostReward}
            />
          ) : (
            <div className="space-y-6">
              <ProfileScreen 
                user={user!} 
                claimsCount={transactions.filter(t => t.type === 'claim').length}
                onSignOut={() => firebaseService.logout()}
                onDeleteAccount={() => firebaseService.deleteAccount()}
              />
              <HistoryScreen transactions={transactions} />
            </div>
          )}
        </AnimatePresence>
      </main>

      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
