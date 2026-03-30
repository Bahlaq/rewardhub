import React from 'react';
import { motion } from 'motion/react';
import {
  Search,
  PlayCircle,
  TrendingUp,
  Gift,
  Clock,
  Zap,
  CheckCircle2,
  Copy,
  ExternalLink,
  Star,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Offer, UserProfile, Transaction } from '../types';
import { Clipboard } from '@capacitor/clipboard';
import { Toast } from '@capacitor/toast';
import { Browser } from '@capacitor/browser';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Offer Card ────────────────────────────────────────────────────────────

interface OfferCardProps {
  offer: Offer;
  onClaim: (offer: Offer, currentCost: number) => void;
  user: UserProfile;
  isClaimedToday: boolean;
  claimedCode?: string;
}

const OfferCard = ({
  offer,
  onClaim,
  user,
  isClaimedToday,
  claimedCode,
}: OfferCardProps) => {
  const safePoints = Math.max(0, Number(user.points || 0));
  const isLocked = safePoints < offer.points && !isClaimedToday;
  const [imageError, setImageError] = React.useState(false);

  const handleCopyCode = async () => {
    const code = claimedCode || offer.code;
    if (code) {
      await Clipboard.write({ string: code });
      await Toast.show({ text: 'Code copied!', duration: 'short' });
    }
  };

  const handleGoToStore = async () => {
    try {
      await Browser.open({ url: offer.url });
    } catch {
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

      {/* Logo area */}
      <div className="relative h-40 flex items-center justify-center bg-zinc-50">
        {!imageError ? (
          <img
            src={offer.logoUrl}
            alt={offer.brand}
            className="w-full h-full object-contain p-4"
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center text-white font-black text-3xl uppercase shadow-lg shadow-indigo-200">
            {offer.brand.charAt(0)}
          </div>
        )}
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
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                Cost
              </span>
              <span className="text-sm font-bold text-zinc-900">
                {offer.points === 0 ? 'FREE' : `${offer.points.toLocaleString()} pts`}
              </span>
            </div>
            <button
              onClick={() => onClaim(offer, offer.points)}
              disabled={isLocked}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2',
                isLocked
                  ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
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

// ─── HomeScreen ────────────────────────────────────────────────────────────

interface HomeScreenProps {
  user: UserProfile;
  offers: Offer[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  categories: string[];
  filteredOffers: Offer[];
  transactions: Transaction[];
  handleWatchAd: () => void;
  handleClaimOffer: (offer: Offer, cost: number) => void;
  handleClaimBoostReward: () => void;
}

export const HomeScreen = ({
  user,
  offers,
  isLoading,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  categories,
  filteredOffers,
  transactions,
  handleWatchAd,
  handleClaimOffer,
  handleClaimBoostReward,
}: HomeScreenProps) => {
  const today = new Date().toDateString();
  const isNewDay = user.lastBoostDate !== today;

  // ── Progressive boost state ──────────────────────────────────────────────
  // boostLevel N = N ads required to earn +100 pts this round
  const boostLevel = isNewDay ? 1 : Math.max(1, Number(user.boostLevel) || 1);

  // Ads watched so far in the CURRENT round (resets after each claim)
  const currentLevelAdCounter = isNewDay
    ? 0
    : Math.max(0, Number(user.currentLevelAdCounter) || 0);

  // Progress percentage (capped at 100%)
  const progressPct = Math.min(100, (currentLevelAdCounter / boostLevel) * 100);

  // Can the user claim their reward right now?
  const canClaimBoost = currentLevelAdCounter >= boostLevel;

  // Ordinal label
  const boostOrdinal =
    boostLevel === 1
      ? '1st'
      : boostLevel === 2
      ? '2nd'
      : boostLevel === 3
      ? '3rd'
      : `${boostLevel}th`;

  // ── Points (never NaN) ───────────────────────────────────────────────────
  const safePoints = Math.max(0, Number(user.points || 0));

  return (
    <motion.div
      key="offers"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="space-y-6"
    >
      {/* ── Search Bar ─────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="relative group">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-600 transition-colors"
            size={18}
          />
          <input
            type="text"
            placeholder="Search coupons, brands, or types…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-zinc-200 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
          />
        </div>

        {/* Categories */}
        <div className="space-y-2">
          <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">
            Categories
          </label>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all border shadow-sm active:scale-95 whitespace-nowrap',
                  selectedCategory === cat
                    ? 'bg-indigo-600 border-indigo-700 text-white shadow-indigo-100'
                    : 'bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Daily Boost Card ────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200 overflow-hidden relative">
        <div className="relative z-10">

          {/* Header row */}
          <div className="flex justify-between items-start mb-1">
            <h2 className="text-lg font-bold">Daily Boost</h2>
            <span className="bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider">
              {boostOrdinal} Boost
            </span>
          </div>

          {/* Sub-line */}
          <p className="text-indigo-100 text-xs mb-4">
            {canClaimBoost
              ? `You've watched ${currentLevelAdCounter}/${boostLevel} ads — claim your +100 pts!`
              : `Watch ${boostLevel} ad${boostLevel !== 1 ? 's' : ''} to earn +100 pts • Progress: ${currentLevelAdCounter}/${boostLevel}`}
          </p>

          {/* Progress bar + Watch Ad button */}
          {!canClaimBoost && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleWatchAd}
                className="bg-white text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-50 transition-colors active:scale-95 flex-shrink-0"
              >
                <PlayCircle size={16} />
                Watch Ad ({currentLevelAdCounter}/{boostLevel})
              </button>

              {/* Progress bar */}
              <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="h-full bg-white rounded-full"
                />
              </div>
            </div>
          )}

          {/* Claim button — only visible when all ads are watched */}
          {canClaimBoost && (
            <motion.button
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              onClick={handleClaimBoostReward}
              className="w-full bg-emerald-400 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-500 active:scale-95 transition-all shadow-lg shadow-emerald-900/25"
            >
              <Star size={16} className="fill-white" />
              Claim +100 Points (Level {boostLevel} Done!)
            </motion.button>
          )}
        </div>

        {/* Decorative icon */}
        <TrendingUp className="absolute -bottom-4 -right-4 text-white/10 w-32 h-32" />
      </div>

      {/* ── Section header ──────────────────────────────────────────────── */}
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

      {/* ── Offer Grid ──────────────────────────────────────────────────── */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">
              Refreshing deals…
            </p>
          </div>
        ) : filteredOffers.length > 0 ? (
          filteredOffers.map((offer) => {
            const claimsTodayForOffer = transactions.filter(
              (t) =>
                t.type === 'claim' &&
                t.title === offer.brand &&
                new Date(t.timestamp).toDateString() === today
            ).length;
            const isClaimedToday = claimsTodayForOffer > 0;
            const claimedCode = isClaimedToday
              ? transactions.find(
                  (t) =>
                    t.type === 'claim' &&
                    t.title === offer.brand
                )?.code
              : undefined;

            return (
              <OfferCard
                key={offer.id}
                offer={offer}
                onClaim={handleClaimOffer}
                user={{ ...user, points: safePoints }}
                isClaimedToday={isClaimedToday}
                claimedCode={claimedCode}
              />
            );
          })
        ) : (
          <div className="bg-white rounded-3xl p-12 border border-dashed border-zinc-200 text-center">
            <Gift size={32} className="text-zinc-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-zinc-900 mb-1">
              More rewards coming soon!
            </h3>
            <p className="text-xs text-zinc-500">
              We're working on bringing you the best deals.
            </p>
          </div>
        )}
      </div>

      {/* Bottom spacer — prevents overlap with Banner Ad + Navbar */}
      <div className="h-[140px]" />

      {/* Banner Ad slot — HomeScreen only */}
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+100px)] left-0 right-0 px-6 pointer-events-none z-[1000]">
        <div className="max-w-md mx-auto bg-zinc-900/95 backdrop-blur-md border border-zinc-800 h-14 rounded-2xl flex items-center justify-center text-[11px] font-black text-white uppercase tracking-[0.2em] pointer-events-auto shadow-2xl shadow-black/40">
          <span className="opacity-40">Sponsored Ad Space</span>
        </div>
      </div>
    </motion.div>
  );
};
