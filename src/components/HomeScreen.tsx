import React from 'react';
import { motion } from 'motion/react';
import {
  Search, PlayCircle, TrendingUp, Gift, Clock, Zap, CheckCircle2,
  Copy, ExternalLink, Award, Loader2, MapPin, ChevronDown, Timer, X
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

export const COUNTRIES = [
  'All Countries',
  'Jordan', 'Palestine', 'Saudi Arabia', 'UAE', 'Kuwait', 'Bahrain',
  'Oman', 'Qatar', 'Egypt', 'Iraq', 'Lebanon', 'Syria', 'Yemen',
  'Libya', 'Tunisia', 'Algeria', 'Morocco', 'Sudan', 'Somalia',
  'Mauritania', 'Djibouti', 'Comoros',
  'Turkey', 'USA', 'UK', 'Germany', 'France', 'Canada', 'Australia',
  'India', 'Pakistan', 'Malaysia', 'Indonesia', 'South Korea',
  'Japan', 'Brazil', 'South Africa', 'Nigeria',
];

// ═══════════════════════════════════════════════════════════════
// offerMatchesCountry
//
// Checks BOTH 'countries' (plural) AND 'country' (singular) fields.
// ALL comparisons converted to UPPERCASE before matching.
//
// Returns true (show offer) when:
//   - User selected "All Countries"
//   - Offer has no country data (null/undefined/empty = Global)
//   - Offer country list includes "GLOBAL" or "ALL"
//   - Offer country list includes the selected country
// ═══════════════════════════════════════════════════════════════
export function offerMatchesCountry(
  offer: Offer,
  selectedCountry: string
): boolean {
  // All Countries → show everything
  if (selectedCountry === 'All Countries') return true;

  // Read from BOTH possible field names
  const offerData = offer as any;
  const pluralField = offerData.countries;
  const singularField = offerData.country;

  // Determine which field has actual data
  let raw: any = null;

  if (pluralField !== undefined && pluralField !== null) {
    raw = pluralField;
  } else if (singularField !== undefined && singularField !== null) {
    raw = singularField;
  }

  // No country data → Global offer → show everywhere
  if (raw === null || raw === undefined) return true;

  // Empty string → Global
  if (typeof raw === 'string' && raw.trim() === '') return true;

  // Empty array → Global
  if (Array.isArray(raw) && raw.length === 0) return true;

  // Convert selected country to uppercase
  const sel = selectedCountry.toUpperCase().trim();

  // Array check: ["UAE", "JORDAN"]
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const val = String(raw[i] || '').toUpperCase().trim();
      if (val === sel || val === 'GLOBAL' || val === 'ALL') {
        return true;
      }
    }
    return false;
  }

  // String check: "Jordan" or "GLOBAL"
  if (typeof raw === 'string') {
    const val = raw.toUpperCase().trim();
    return val === sel || val === 'GLOBAL' || val === 'ALL';
  }

  // Unknown type → show everywhere (safe fallback)
  return true;
}

// 48hr unlock tracking
const UL_KEY = 'rh_unlocks';
const UL_MS = 48 * 60 * 60 * 1000;

function getUnlocks(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(UL_KEY) || '{}');
  } catch {
    return {};
  }
}

export function isOfferUnlocked(
  offerId: string,
  tx: Transaction[],
  brand: string
): boolean {
  const today = new Date().toDateString();
  const claimedToday = tx.some(
    (t) => t.type === 'claim' && t.title === brand &&
      new Date(t.timestamp).toDateString() === today
  );
  if (claimedToday) return true;

  const ts = getUnlocks()[offerId];
  if (!ts) return false;
  return Date.now() - ts < UL_MS;
}

export function recordUnlock(id: string): void {
  const u = getUnlocks();
  u[id] = Date.now();
  // Clean expired
  const now = Date.now();
  for (const k of Object.keys(u)) {
    if (now - u[k] >= UL_MS) delete u[k];
  }
  localStorage.setItem(UL_KEY, JSON.stringify(u));
}

export function getTimeLeft(id: string): string | null {
  const ts = getUnlocks()[id];
  if (!ts) return null;
  const r = UL_MS - (Date.now() - ts);
  if (r <= 0) return null;
  const h = Math.floor(r / 3600000);
  const m = Math.floor((r % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// ─── Searchable Country Picker ──────────────────────────────────
const CountryPicker = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) => {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const list = COUNTRIES.filter((c) =>
    c.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 bg-white border border-zinc-200 rounded-2xl py-3 px-4 text-sm font-semibold text-zinc-800 shadow-sm active:scale-[0.99]"
      >
        <MapPin size={16} className="text-indigo-500 shrink-0" />
        <span className="flex-1 text-left truncate">{value}</span>
        <ChevronDown
          size={16}
          className={cn(
            'text-zinc-400 transition-transform shrink-0',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setQ('');
            }}
          />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-zinc-200 rounded-2xl shadow-xl z-50 overflow-hidden">
            <div className="p-3 border-b border-zinc-100">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                />
                <input
                  type="text"
                  placeholder="Search..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoFocus
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl py-2 pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                {q && (
                  <button
                    onClick={() => setQ('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    <X size={14} className="text-zinc-400" />
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {list.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                    setQ('');
                  }}
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-sm',
                    value === c
                      ? 'bg-indigo-50 text-indigo-700 font-bold'
                      : 'hover:bg-zinc-50 text-zinc-700'
                  )}
                >
                  {c}
                </button>
              ))}
              {list.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-zinc-400">
                  No match
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Offer Card ─────────────────────────────────────────────────
const OfferCard = ({
  offer,
  onClaim,
  user,
  unlocked,
  code,
  timeLeft,
}: {
  offer: Offer;
  onClaim: (o: Offer, c: number) => void;
  user: UserProfile;
  unlocked: boolean;
  code?: string;
  timeLeft?: string | null;
}) => {
  const locked = user.points < offer.points && !unlocked;
  const [imgErr, setImgErr] = React.useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm hover:shadow-md relative"
    >
      {unlocked && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-emerald-500 text-white px-2 py-1 rounded-lg font-bold text-[10px] uppercase tracking-wider">
          <CheckCircle2 size={12} /> {timeLeft || 'Unlocked'}
        </div>
      )}

      <div className="relative h-40 flex items-center justify-center bg-zinc-50">
        {!imgErr ? (
          <img
            src={offer.logoUrl}
            alt={offer.brand}
            className="w-full h-full object-contain p-4"
            referrerPolicy="no-referrer"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center text-white font-black text-3xl">
            {offer.brand.charAt(0)}
          </div>
        )}
        <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-[10px] font-bold uppercase text-zinc-700">
          {offer.type}
        </div>
      </div>

      <div className="p-4">
        <h3 className="font-bold text-zinc-900 mb-1">{offer.brand}</h3>
        <p className="text-xs text-zinc-500 mb-4 line-clamp-2">
          {offer.description}
        </p>

        {unlocked ? (
          <div className="space-y-3">
            {(code || offer.code) && (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-zinc-100 px-3 py-2 rounded-xl font-mono text-sm font-bold text-zinc-700 border border-zinc-200 truncate">
                  {code || offer.code}
                </div>
                <button
                  onClick={async () => {
                    await Clipboard.write({ string: code || offer.code! });
                    await Toast.show({ text: 'Copied!', duration: 'short' });
                  }}
                  className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"
                >
                  <Copy size={18} />
                </button>
              </div>
            )}
            <button
              onClick={async () => {
                try {
                  await Browser.open({ url: offer.url });
                } catch {
                  window.open(offer.url, '_blank');
                }
              }}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-95"
            >
              <ExternalLink size={14} /> Go to Store
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                Cost
              </span>
              <span className="text-sm font-bold text-zinc-900">
                {offer.points === 0
                  ? 'FREE'
                  : `${offer.points.toLocaleString()} pts`}
              </span>
            </div>
            <button
              onClick={() => onClaim(offer, offer.points)}
              disabled={locked}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2',
                locked
                  ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white active:scale-95'
              )}
            >
              {locked ? (
                <>
                  <Clock size={14} /> Locked
                </>
              ) : (
                <>
                  <Zap size={14} /> Unlock
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ─── HomeScreen Props ───────────────────────────────────────────
interface HomeScreenProps {
  user: UserProfile;
  offers: Offer[];
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategory: string;
  setSelectedCategory: (c: string) => void;
  categories: string[];
  filteredOffers: Offer[];
  transactions: Transaction[];
  handleWatchAd: () => void;
  handleClaimOffer: (o: Offer, c: number) => void;
  handleClaimBoostReward: () => void;
  isAdRunning?: boolean;
  selectedCountry: string;
  setSelectedCountry: (c: string) => void;
  isCooldownActive: boolean;
  cooldownSecondsLeft: number;
}

// ─── HomeScreen Component ───────────────────────────────────────
export const HomeScreen = (props: HomeScreenProps) => {
  const {
    user,
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
    isAdRunning = false,
    selectedCountry,
    setSelectedCountry,
    isCooldownActive,
    cooldownSecondsLeft,
  } = props;

  const today = new Date().toDateString();
  const isNewDay = user.lastBoostDate !== today;
  const boostLevel = isNewDay ? 1 : Number(user.boostLevel) || 1;
  const progress = isNewDay ? 0 : Number(user.currentLevelAdCounter) || 0;
  const adsNeeded = boostLevel;
  const isComplete = progress >= adsNeeded;
  const pct = Math.min((progress / Math.max(adsNeeded, 1)) * 100, 100);

  const boostTitle =
    boostLevel === 1
      ? 'First Boost'
      : boostLevel === 2
        ? 'Second Boost'
        : boostLevel === 3
          ? 'Third Boost'
          : `${boostLevel}th Boost`;

  const cooldownStr = `${Math.floor(cooldownSecondsLeft / 60)}:${String(
    cooldownSecondsLeft % 60
  ).padStart(2, '0')}`;

  return (
    <motion.div
      key="offers"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="space-y-5"
    >
      {/* Country Picker */}
      <CountryPicker value={selectedCountry} onChange={setSelectedCountry} />

      {/* Search + Categories */}
      <div className="space-y-3">
        <div className="relative group">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-600"
            size={18}
          />
          <input
            type="text"
            placeholder="Search coupons, brands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-zinc-200 rounded-2xl py-3.5 pl-12 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setSelectedCategory(c)}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-bold capitalize border shadow-sm active:scale-95 whitespace-nowrap',
                selectedCategory === c
                  ? 'bg-indigo-600 border-indigo-700 text-white'
                  : 'bg-white border-zinc-200 text-zinc-600'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Daily Boost */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200 overflow-hidden relative">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-1">
            <h2 className="text-lg font-bold">Daily Boost</h2>
            <span className="bg-white/20 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase">
              {boostTitle}
            </span>
          </div>
          <p className="text-indigo-100 text-xs mb-4">
            {isCooldownActive
              ? `Next in ${cooldownStr}`
              : isAdRunning
                ? 'Playing...'
                : isComplete
                  ? 'Done! Claim 100 pts.'
                  : `${progress}/${adsNeeded} ads (+100 pts)`}
          </p>
          <div className="flex items-center gap-3">
            {isCooldownActive ? (
              <div className="bg-white/10 border border-white/20 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 text-white/70">
                <Timer size={16} className="animate-pulse" /> {cooldownStr}
              </div>
            ) : isAdRunning ? (
              <div className="bg-white/20 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Playing...
              </div>
            ) : isComplete ? (
              <button
                onClick={handleClaimBoostReward}
                className="bg-emerald-400 text-emerald-900 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 active:scale-95 animate-pulse"
              >
                <Award size={16} /> Claim +100!
              </button>
            ) : (
              <button
                onClick={handleWatchAd}
                className="bg-white text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 active:scale-95"
              >
                <PlayCircle size={16} /> Watch ({progress}/{adsNeeded})
              </button>
            )}
            <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${isCooldownActive ? 100 : pct}%`,
                }}
                className={cn(
                  'h-full',
                  isCooldownActive
                    ? 'bg-amber-400'
                    : isComplete
                      ? 'bg-emerald-400'
                      : 'bg-white'
                )}
              />
            </div>
          </div>
        </div>
        <TrendingUp className="absolute -bottom-4 -right-4 text-white/10 w-32 h-32" />
      </div>

      {/* Offers header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">
          {searchQuery ? 'Results' : 'Available Rewards'}
        </h2>
        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
          {filteredOffers.length}
        </span>
      </div>

      {/* Offer cards */}
      <div className="grid gap-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredOffers.length > 0 ? (
          filteredOffers.map((o) => (
            <OfferCard
              key={o.id}
              offer={o}
              onClaim={handleClaimOffer}
              user={user}
              unlocked={isOfferUnlocked(o.id, transactions, o.brand)}
              code={transactions.find((t) => t.title === o.brand)?.code}
              timeLeft={getTimeLeft(o.id)}
            />
          ))
        ) : (
          <div className="bg-white rounded-3xl p-12 border border-dashed border-zinc-200 text-center">
            <Gift size={32} className="text-zinc-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-zinc-900 mb-1">
              No rewards in {selectedCountry}
            </h3>
            <p className="text-xs text-zinc-500">
              Try "All Countries" or another selection.
            </p>
          </div>
        )}
      </div>

      <div className="h-[100px]" />
    </motion.div>
  );
};
