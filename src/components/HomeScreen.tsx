import React from 'react';
import { motion } from 'motion/react';
import { Search, PlayCircle, TrendingUp, Gift, Clock, Zap, CheckCircle2, Copy, ExternalLink, Award, Loader2, MapPin, ChevronDown, Timer } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Offer, UserProfile, Transaction } from '../types';
import { Clipboard } from '@capacitor/clipboard';
import { Toast } from '@capacitor/toast';
import { Browser } from '@capacitor/browser';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// ═══════════════════════════════════════════════════════════════════════
// Country list — All Arab nations + major global countries.
// Israel is intentionally excluded — it is an occupation, not a state.
// "All Countries" shows everything. "Global" offers show in every country.
// If a Firestore offer has a country NOT in this list, the app still
// handles it — the filter logic matches against the raw string.
// ═══════════════════════════════════════════════════════════════════════
export const COUNTRIES = [
  'All Countries',
  // Arab Countries
  'Jordan',
  'Palestine',
  'Saudi Arabia',
  'UAE',
  'Kuwait',
  'Bahrain',
  'Oman',
  'Qatar',
  'Egypt',
  'Iraq',
  'Lebanon',
  'Syria',
  'Yemen',
  'Libya',
  'Tunisia',
  'Algeria',
  'Morocco',
  'Sudan',
  'Somalia',
  'Mauritania',
  'Djibouti',
  'Comoros',
  // Major Global
  'Turkey',
  'United States',
  'United Kingdom',
  'Germany',
  'France',
  'Canada',
  'Australia',
  'India',
  'Pakistan',
  'Malaysia',
  'Indonesia',
  'South Korea',
  'Japan',
  'Brazil',
  'South Africa',
  'Nigeria',
];

const OfferCard = ({ offer, onClaim, user, isClaimedToday, claimedCode }: {
  offer: Offer; onClaim: (offer: Offer, cost: number) => void; user: UserProfile; isClaimedToday: boolean; claimedCode?: string;
}) => {
  const isLocked = user.points < offer.points && !isClaimedToday;
  const [imageError, setImageError] = React.useState(false);

  return (
    <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow relative">
      {isClaimedToday && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-emerald-500 text-white px-2 py-1 rounded-lg font-bold text-[10px] shadow-lg uppercase tracking-wider">
          <CheckCircle2 size={12} /> Unlocked
        </div>
      )}
      {offer.country && offer.country !== 'Global' && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-indigo-500/90 text-white px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider">
          <MapPin size={10} />{offer.country}
        </div>
      )}
      <div className="relative h-40 flex items-center justify-center bg-zinc-50">
        {!imageError ? (
          <img src={offer.logoUrl} alt={offer.brand} className="w-full h-full object-contain p-4" referrerPolicy="no-referrer" onError={() => setImageError(true)} />
        ) : (
          <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center text-white font-black text-3xl uppercase shadow-lg shadow-indigo-200">{offer.brand.charAt(0)}</div>
        )}
        {(!offer.country || offer.country === 'Global') && (
          <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide text-zinc-700">{offer.type}</div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-bold text-zinc-900 leading-tight mb-1">{offer.brand}</h3>
        <p className="text-xs text-zinc-500 mb-4 line-clamp-2">{offer.description}</p>
        {isClaimedToday ? (
          <div className="space-y-3">
            {(claimedCode || offer.code) && (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-zinc-100 px-3 py-2 rounded-xl font-mono text-sm font-bold text-zinc-700 border border-zinc-200 truncate">{claimedCode || offer.code}</div>
                <button onClick={async () => { await Clipboard.write({ string: claimedCode || offer.code! }); await Toast.show({ text: 'Code copied!', duration: 'short' }); }}
                  className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100"><Copy size={18} /></button>
              </div>
            )}
            <button onClick={async () => { try { await Browser.open({ url: offer.url }); } catch { window.open(offer.url, '_blank'); } }}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-95">
              <ExternalLink size={14} /> Go to Store
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between mt-auto">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Cost</span>
              <span className="text-sm font-bold text-zinc-900">{offer.points === 0 ? 'FREE' : `${offer.points.toLocaleString()} pts`}</span>
            </div>
            <button onClick={() => onClaim(offer, offer.points)} disabled={isLocked}
              className={cn("px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                isLocked ? "bg-zinc-100 text-zinc-400 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95")}>
              {isLocked ? <Clock size={14} /> : <Zap size={14} />}
              {isLocked ? 'Locked' : 'Unlock'}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

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
  isAdRunning?: boolean;
  selectedCountry: string;
  setSelectedCountry: (country: string) => void;
  // Cooldown props
  isCooldownActive: boolean;
  cooldownSecondsLeft: number;
}

export const HomeScreen = ({
  user, offers, isLoading, searchQuery, setSearchQuery, selectedCategory, setSelectedCategory,
  categories, filteredOffers, transactions, handleWatchAd, handleClaimOffer, handleClaimBoostReward,
  isAdRunning = false, selectedCountry, setSelectedCountry,
  isCooldownActive, cooldownSecondsLeft
}: HomeScreenProps) => {
  const today = new Date().toDateString();
  const isNewDay = user.lastBoostDate !== today;
  const boostLevel = isNewDay ? 1 : (Number(user.boostLevel) || 1);
  const currentProgress = isNewDay ? 0 : (Number(user.currentLevelAdCounter) || 0);
  const adsNeeded = boostLevel;
  const isLevelComplete = currentProgress >= adsNeeded;
  const progressPercent = Math.min((currentProgress / Math.max(adsNeeded, 1)) * 100, 100);
  const boostTitle = boostLevel === 1 ? 'First Boost' : boostLevel === 2 ? 'Second Boost' : boostLevel === 3 ? 'Third Boost' : `${boostLevel}th Boost`;

  // Format cooldown as M:SS
  const cooldownDisplay = `${Math.floor(cooldownSecondsLeft / 60)}:${String(cooldownSecondsLeft % 60).padStart(2, '0')}`;

  return (
    <motion.div key="offers" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-5">

      {/* Country Selector */}
      <div className="relative">
        <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-500 pointer-events-none" />
        <select value={selectedCountry} onChange={(e) => setSelectedCountry(e.target.value)}
          className="w-full appearance-none bg-white border border-zinc-200 rounded-2xl py-3 pl-10 pr-10 text-sm font-semibold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm cursor-pointer">
          {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
      </div>

      {/* Search + Categories */}
      <div className="space-y-3">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
          <input type="text" placeholder="Search coupons, brands, or types..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-zinc-200 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
          {categories.map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat)}
              className={cn("px-4 py-2 rounded-xl text-xs font-bold capitalize border shadow-sm active:scale-95 whitespace-nowrap",
                selectedCategory === cat ? "bg-indigo-600 border-indigo-700 text-white" : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-300"
              )}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Daily Boost Card — with cooldown support */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200 overflow-hidden relative">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-1">
            <h2 className="text-lg font-bold">Daily Boost</h2>
            <span className="bg-white/20 backdrop-blur px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider">{boostTitle}</span>
          </div>
          <p className="text-indigo-100 text-xs mb-4">
            {isCooldownActive
              ? `Level complete! Next level unlocks in ${cooldownDisplay}.`
              : isAdRunning ? 'Playing ads... Please wait.'
              : isLevelComplete ? `All ${adsNeeded} ad${adsNeeded > 1 ? 's' : ''} watched! Claim your 100 points.`
              : `Progress: ${currentProgress}/${adsNeeded} ads for ${boostTitle} (+100 pts)`}
          </p>
          <div className="flex items-center gap-3">
            {isCooldownActive ? (
              /* Cooldown state — button disabled with timer */
              <div className="bg-white/10 backdrop-blur border border-white/20 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 text-white/70">
                <Timer size={16} className="animate-pulse" /> Cooldown {cooldownDisplay}
              </div>
            ) : isAdRunning ? (
              <div className="bg-white/20 backdrop-blur px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Playing Ads...</div>
            ) : isLevelComplete ? (
              <button onClick={handleClaimBoostReward} className="bg-emerald-400 text-emerald-900 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-emerald-300 active:scale-95 animate-pulse"><Award size={16} /> Claim +100 Points!</button>
            ) : (
              <button onClick={handleWatchAd} className="bg-white text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-50 active:scale-95"><PlayCircle size={16} /> Watch Ad ({currentProgress}/{adsNeeded})</button>
            )}
            <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${isCooldownActive ? 100 : progressPercent}%` }}
                className={cn("h-full transition-all", isCooldownActive ? "bg-amber-400" : isLevelComplete ? "bg-emerald-400" : "bg-white")} />
            </div>
          </div>
        </div>
        <TrendingUp className="absolute -bottom-4 -right-4 text-white/10 w-32 h-32" />
      </div>

      {/* Offer List */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{searchQuery ? `Results (${filteredOffers.length})` : 'Available Rewards'}</h2>
        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{filteredOffers.length} Offers</span>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Refreshing...</p>
          </div>
        ) : filteredOffers.length > 0 ? (
          filteredOffers.map(offer => {
            const claimed = transactions.some(t => t.type === 'claim' && t.title === offer.brand && new Date(t.timestamp).toDateString() === today);
            return <OfferCard key={offer.id} offer={offer} onClaim={handleClaimOffer} user={user} isClaimedToday={claimed}
              claimedCode={claimed ? transactions.find(t => t.title === offer.brand)?.code : undefined} />;
          })
        ) : (
          <div className="bg-white rounded-3xl p-12 border border-dashed border-zinc-200 text-center">
            <Gift size={32} className="text-zinc-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-zinc-900 mb-1">No rewards in {selectedCountry}</h3>
            <p className="text-xs text-zinc-500">Try "All Countries" or a different selection.</p>
          </div>
        )}
      </div>
      <div className="h-[100px]" />
    </motion.div>
  );
};
