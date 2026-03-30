import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, LayoutDashboard, User, Terminal, PlayCircle, LogIn
} from 'lucide-react';
import { Toast } from '@capacitor/toast';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// استيراد الأنواع والخدمات
import { UserProfile, Transaction } from './types';
import { useAds } from './hooks/useAds';
import { firebaseService, FirebaseUser, isConfigValid } from './services/firebase';
import { APP_NAME, APP_VERSION } from './constants';

// استيراد المكونات
import { HomeScreen } from './components/HomeScreen';
import { ProfileScreen } from './components/ProfileScreen';
import { HistoryScreen } from './components/HistoryScreen';

import icon from '../assets/icon.png';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const Logo = ({ className }: { className?: string }) => (
  <div className={cn("relative w-full mx-auto group cursor-pointer", className)}>
    <img src={icon} alt={APP_NAME} className="w-full h-auto object-contain rounded-[2.5rem] shadow-2xl" />
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState('offers');
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isAdOpen, setIsAdOpen] = useState(false);

  // 1. مراقبة حالة الدخول
  useEffect(() => {
    const unsub = firebaseService.onAuthChange((fUser) => {
      setFirebaseUser(fUser);
      if (!fUser) setIsAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // 2. مزامنة البيانات الحية
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

  const { offers, isLoading, watchAd, claimBoostReward } = useAds(firebaseUser?.uid);
  const displayPoints = useMemo(() => Math.max(0, Number(user?.points || 0)), [user?.points]);

  // --- دوال تسجيل الدخول ---

  const handleSignIn = async () => {
    setIsAuthLoading(true);
    try {
      const result = await firebaseService.signInWithGoogle();
      if (!result) {
        setIsAuthLoading(false);
        Toast.show({ text: "Google login cancelled or failed.", duration: 'short' });
      }
    } catch (error: any) {
      setIsAuthLoading(false);
      console.error("Login Error:", error);
      Toast.show({ text: `Login Error: ${error.message || 'Check SHA-1'}`, duration: 'long' });
    }
  };

  const handleGuestSignIn = async () => {
    setIsAuthLoading(true);
    try {
      await firebaseService.signInAnonymously();
      Toast.show({ text: "Signed in as Guest", duration: 'short' });
    } catch (error) {
      setIsAuthLoading(false);
      Toast.show({ text: "Guest Login Failed", duration: 'short' });
    }
  };

  if (!isConfigValid) return <div className="p-10 text-center">Firebase Config Missing!</div>;

  // شاشة التحميل (Loading)
  if (isAuthLoading) {
    return (
      <div className="h-screen bg-zinc-50 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Connecting...</p>
      </div>
    );
  }

  // شاشة الترحيب (Login Screen)
  if (!firebaseUser) {
    return (
      <div className="h-screen bg-zinc-50 flex flex-col items-center justify-center p-8 text-center">
        <Logo className="max-w-[140px] mb-8" />
        <h1 className="text-3xl font-black text-zinc-900 mb-2">RewardHub</h1>
        <p className="text-sm text-zinc-500 mb-10">Start earning rewards today!</p>
        
        <div className="w-full max-w-xs space-y-4">
          <button onClick={handleSignIn} className="w-full bg-white border border-zinc-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-sm active:scale-95 transition-all">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" className="w-5 h-5" />
            Continue with Google
          </button>

          <button onClick={handleGuestSignIn} className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all">
            <LogIn size={20} />
            Continue as Guest
          </button>
        </div>
      </div>
    );
  }

  // التطبيق الرئيسي
  return (
    <div className="h-screen flex flex-col bg-zinc-50 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-zinc-100 px-5 py-3 flex justify-between items-center pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <div className="flex items-center gap-2">
          <Logo className="max-w-[30px]" />
          <span className="font-black text-zinc-900">{APP_NAME}</span>
        </div>
        <div className="bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100 flex items-center gap-2">
          <Zap size={14} className="text-indigo-600 fill-indigo-600" />
          <span className="text-sm font-bold text-indigo-700">{displayPoints} pts</span>
        </div>
      </header>
      
      <main className="flex-1 overflow-y-auto px-6 py-6 pb-32">
        <AnimatePresence mode="wait">
          {activeTab === 'offers' ? (
            <HomeScreen 
              user={user!} 
              offers={offers} 
              isLoading={isLoading} 
              transactions={transactions}
              handleWatchAd={() => setIsAdOpen(true)} 
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

      {/* Navbar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-10 py-3 flex justify-between pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <button onClick={() => setActiveTab('offers')} className={cn("flex flex-col items-center gap-1", activeTab === 'offers' ? "text-indigo-600" : "text-zinc-400")}>
          <LayoutDashboard size={20} />
          <span className="text-[10px] font-bold uppercase">Rewards</span>
        </button>
        <button onClick={() => setActiveTab('profile')} className={cn("flex flex-col items-center gap-1", activeTab === 'profile' ? "text-indigo-600" : "text-zinc-400")}>
          <User size={20} />
          <span className="text-[10px] font-bold uppercase">Profile</span>
        </button>
      </nav>
    </div>
  );
}
