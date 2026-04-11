import React from 'react';
import { motion } from 'motion/react';
import { Search, PlayCircle, TrendingUp, Gift, Clock, Zap, CheckCircle2, Copy, ExternalLink, Award, Loader2, MapPin, ChevronDown, Timer, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Offer, UserProfile, Transaction } from '../types';
import { Clipboard } from '@capacitor/clipboard';
import { Toast } from '@capacitor/toast';
import { Browser } from '@capacitor/browser';

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

export const COUNTRIES = [
  'All Countries',
  'Jordan', 'Palestine', 'Saudi Arabia', 'UAE', 'Kuwait', 'Bahrain', 'Oman', 'Qatar',
  'Egypt', 'Iraq', 'Lebanon', 'Syria', 'Yemen', 'Libya', 'Tunisia', 'Algeria', 'Morocco',
  'Sudan', 'Somalia', 'Mauritania', 'Djibouti', 'Comoros',
  'Turkey', 'USA', 'UK', 'Germany', 'France', 'Canada', 'Australia',
  'India', 'Pakistan', 'Malaysia', 'Indonesia', 'South Korea', 'Japan', 'Brazil',
  'South Africa', 'Nigeria',
];

// 48-hour unlock expiration helpers
const UNLOCK_STORAGE_KEY = 'rewardhub_unlocks';
const UNLOCK_DURATION_MS = 48 * 60 * 60 * 1000;

function getUnlockTimestamps(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(UNLOCK_STORAGE_KEY) || '{}'); } catch { return {}; }
}
function isOfferUnlocked(offerId: string, transactions: Transaction[], offerBrand: string): boolean {
  const hasClaim = transactions.some(t => t.type === 'claim' && t.title === offerBrand && new Date(t.timestamp).toDateString() === new Date().toDateString());
  if (hasClaim) return true;
  const stamps = getUnlockTimestamps();
  const ts = stamps[offerId];
  if (!ts) return false;
  return Date.now() - ts < UNLOCK_DURATION_MS;
}
function recordUnlock(offerId: string) {
  const stamps = getUnlockTimestamps();
  stamps[offerId] = Date.now();
  // Clean expired entries
  const now = Date.now();
  Object.keys(stamps).forEach(k => { if (now - stamps[k] >= UNLOCK_DURATION_MS) delete stamps[k]; });
  localStorage.setItem(UNLOCK_STORAGE_KEY, JSON.stringify(stamps));
}
function getUnlockTimeRemaining(offerId: string): string | null {
  const stamps = getUnlockTimestamps();
  const ts = stamps[offerId];
  if (!ts) return null;
  const remaining = UNLOCK_DURATION_MS - (Date.now() - ts);
  if (remaining <= 0) return null;
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${mins}m left`;
}

// Check if offer matches selected country
function offerMatchesCountry(offer: Offer, selectedCountry: string): boolean {
  if (selectedCountry === 'All Countries') return true;
  const countries = offer.countries;
  // null, undefined, empty string, empty array → Global offer
  if (!countries || (Array.isArray(countries) && countries.length === 0) || countries === '') return true;
  if (typeof countries === 'string') {
    return countries === 'Global' || countries.toLowerCase() === selectedCountry.toLowerCase();
  }
  if (Array.isArray(countries)) {
    return countries.some(c => c === 'Global' || c.toLowerCase() === selectedCountry.toLowerCase());
  }
  return true;
}

// Searchable Country Selector
const CountrySelector = ({ selectedCountry, setSelectedCountry }: { selectedCountry: string; setSelectedCountry: (c: string) => void }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const filtered = COUNTRIES.filter(c => c.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 bg-white border border-zinc-200 rounded-2xl py-3 px-4 text-sm font-semibold text-zinc-800 shadow-sm">
        <MapPin size={16} className="text-indigo-500" />
        <span className="flex-1 text-left">{selectedCountry}</span>
        <ChevronDown size={16} className={cn("text-zinc-400 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-zinc-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="p-3 border-b border-zinc-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input type="text" placeholder="Search country..." value={search} onChange={e => setSearch(e.target.value)} autoFocus
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
              {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X size={14} className="text-zinc-400" /></button>}
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.map(c => (
              <button key={c} onClick={() => { setSelectedCountry(c); setIsOpen(false); setSearch(''); }}
                className={cn("w-full text-left px-4 py-2.5 text-sm transition-colors",
                  selectedCountry === c ? "bg-indigo-50 text-indigo-700 font-bold" : "hover:bg-zinc-50 text-zinc-700")}>
                {c}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-4 py-6 text-center text-xs text-zinc-400">No countries found</p>}
          </div>
        </div>
      )}
    </div>
  );
};

const OfferCard = ({ offer, onClaim, user, isUnlocked, claimedCode, unlockTimeLeft }: {
  offer: Offer; onClaim: (offer: Offer, cost: number) => void; user: UserProfile; isUnlocked: boolean; claimedCode?: string; unlockTimeLeft?: string | null;
}) => {
  const isLocked = user.points < offer.points && !isUnlocked;
  const [imageError, setImageError] = React.useState(false);

  return (
    <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow relative">
      {isUnlocked && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-emerald-500 text-white px-2 py-1 rounded-lg font-bold text-[10px] shadow-lg uppercase tracking-wider">
          <CheckCircle2 size={12} /> {unlockTimeLeft || 'Unlocked'}
        </div>
      )}
      <div className="relative h-40 flex items-center justify-center bg-zinc-50">
        {!imageError ? (
          <img src={offer.logoUrl} alt={offer.brand} className="w-full h-full object-contain p-4" referrerPolicy="no-referrer" onError={() => setImageError(true)} />
        ) : (
          <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center text-white font-black text-3xl uppercase shadow-lg">{offer.brand.charAt(0)}</div>
        )}
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide text-zinc-700">{offer.type}</div>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-zinc-900 leading-tight mb-1">{offer.brand}</h3>
        <p className="text-xs text-zinc-500 mb-4 line-clamp-2">{offer.description}</p>
        {isUnlocked ? (
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
  user: UserProfile; offers: Offer[]; isLoading: boolean;
  searchQuery: string; setSearchQuery: (q: string) => void;
  selectedCategory: string; setSelectedCategory: (c: string) => void;
  categories: string[]; filteredOffers: Offer[]; transactions: Transaction[];
  handleWatchAd: () => void; handleClaimOffer: (offer: Offer, cost: number) => void;
  handleClaimBoostReward: () => void; isAdRunning?: boolean;
  selectedCountry: string; setSelectedCountry: (c: string) => void;
  isCooldownActive: boolean; cooldownSecondsLeft: number;
}

export { offerMatchesCountry, recordUnlock, isOfferUnlocked, getUnlockTimeRemaining };

export const HomeScreen = ({
  user, offers, isLoading, searchQuery, setSearchQuery, selectedCategory, setSelectedCategory,
  categories, filteredOffers, transactions, handleWatchAd, handleClaimOffer, handleClaimBoostReward,
  isAdRunning = false, selectedCountry, setSelectedCountry, isCooldownActive, cooldownSecondsLeft
}: HomeScreenProps) => {
  const today = new Date().toDateString();
  const isNewDay = user.lastBoostDate !== today;
  const boostLevel = isNewDay ? 1 : (Number(user.boostLevel) || 1);
  const currentProgress = isNewDay ? 0 : (Number(user.currentLevelAdCounter) || 0);
  const adsNeeded = boostLevel;
  const isLevelComplete = currentProgress >= adsNeeded;
  const progressPercent = Math.min((currentProgress / Math.max(adsNeeded, 1)) * 100, 100);
  const boostTitle = boostLevel === 1 ? 'First Boost' : boostLevel === 2 ? 'Second Boost' : boostLevel === 3 ? 'Third Boost' : `${boostLevel}th Boost`;
  const cooldownDisplay = `${Math.floor(cooldownSecondsLeft / 60)}:${String(cooldownSecondsLeft % 60).padStart(2, '0')}`;

  return (
    <motion.div key="offers" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-5">
      <CountrySelector selectedCountry={selectedCountry} setSelectedCountry={setSelectedCountry} />

      <div className="space-y-3">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-600" size={18} />
          <input type="text" placeholder="Search coupons, brands, or types..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-zinc-200 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
          {categories.map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat)}
              className={cn("px-4 py-2 rounded-xl text-xs font-bold capitalize border shadow-sm active:scale-95 whitespace-nowrap",
                selectedCategory === cat ? "bg-indigo-600 border-indigo-700 text-white" : "bg-white border-zinc-200 text-zinc-600"
              )}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Daily Boost */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200 overflow-hidden relative">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-1">
            <h2 className="text-lg font-bold">Daily Boost</h2>
            <span className="bg-white/20 backdrop-blur px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider">{boostTitle}</span>
          </div>
          <p className="text-indigo-100 text-xs mb-4">
            {isCooldownActive ? `Level complete! Next in ${cooldownDisplay}.` : isAdRunning ? 'Playing ads...' : isLevelComplete ? `All ${adsNeeded} ads watched! Claim your 100 pts.` : `Progress: ${currentProgress}/${adsNeeded} ads (+100 pts)`}
          </p>
          <div className="flex items-center gap-3">
            {isCooldownActive ? (
              <div className="bg-white/10 border border-white/20 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 text-white/70"><Timer size={16} className="animate-pulse" /> Cooldown {cooldownDisplay}</div>
            ) : isAdRunning ? (
              <div className="bg-white/20 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Playing...</div>
            ) : isLevelComplete ? (
              <button onClick={handleClaimBoostReward} className="bg-emerald-400 text-emerald-900 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-emerald-300 active:scale-95 animate-pulse"><Award size={16} /> Claim +100 Points!</button>
            ) : (
              <button onClick={handleWatchAd} className="bg-white text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-50 active:scale-95"><PlayCircle size={16} /> Watch Ad ({currentProgress}/{adsNeeded})</button>
            )}
            <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${isCooldownActive ? 100 : progressPercent}%` }}
                className={cn("h-full", isCooldownActive ? "bg-amber-400" : isLevelComplete ? "bg-emerald-400" : "bg-white")} />
            </div>
          </div>
        </div>
        <TrendingUp className="absolute -bottom-4 -right-4 text-white/10 w-32 h-32" />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">{searchQuery ? `Results (${filteredOffers.length})` : 'Available Rewards'}</h2>
        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{filteredOffers.length} Offers</span>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4"><div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : filteredOffers.length > 0 ? (
          filteredOffers.map(offer => {
            const unlocked = isOfferUnlocked(offer.id, transactions, offer.brand);
            const timeLeft = getUnlockTimeRemaining(offer.id);
            const code = transactions.find(t => t.title === offer.brand)?.code;
            return <OfferCard key={offer.id} offer={offer} onClaim={handleClaimOffer} user={user}
              isUnlocked={unlocked} claimedCode={code} unlockTimeLeft={timeLeft} />;
          })
        ) : (
          <div className="bg-white rounded-3xl p-12 border border-dashed border-zinc-200 text-center">
            <Gift size={32} className="text-zinc-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-zinc-900 mb-1">No rewards found</h3>
            <p className="text-xs text-zinc-500">Try a different country or category.</p>
          </div>
        )}
      </div>
      <div className="h-[100px]" />
    </motion.div>
  );
};
