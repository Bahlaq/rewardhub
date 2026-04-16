// HomeScreen — v13.4.0 (refreshed 2026-04-16). Dynamic filters + skeleton loaders.
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

// ═══════════════════════════════════════════════════════════════════════
// Sentinels for the "show everything" options.
// Keep these in sync with the defaults in App.tsx.
// ═══════════════════════════════════════════════════════════════════════
export const ALL_COUNTRIES = 'All Countries';
export const ALL_CATEGORIES = 'All Categories';

// ═══════════════════════════════════════════════════════════════════════
// buildCountriesList — derives a unique, sorted list of country names from
// the offers collection received from Firestore.
//
// Reads from BOTH `countries` (array or string) and `country` (string).
// The sentinels "GLOBAL" and "ALL" are treated as "no specific country"
// and do not appear as dropdown entries.
// Always prepends ALL_COUNTRIES so the user can reset the filter.
// ═══════════════════════════════════════════════════════════════════════
export function buildCountriesList(offers: Offer[]): string[] {
  const set = new Set<string>();
  for (let i = 0; i < offers.length; i++) {
    const data = offers[i] as any;
    const plural = data.countries;
    const singular = data.country;

    if (Array.isArray(plural)) {
      for (let j = 0; j < plural.length; j++) {
        const s = String(plural[j] || '').trim();
        if (!s) continue;
        const upper = s.toUpperCase();
        if (upper === 'GLOBAL' || upper === 'ALL') continue;
        set.add(s);
      }
    } else if (typeof plural === 'string' && plural.trim()) {
      const s = plural.trim();
      const upper = s.toUpperCase();
      if (upper !== 'GLOBAL' && upper !== 'ALL') set.add(s);
    }

    if (typeof singular === 'string' && singular.trim()) {
      const s = singular.trim();
      const upper = s.toUpperCase();
      if (upper !== 'GLOBAL' && upper !== 'ALL') set.add(s);
    }
  }
  return [ALL_COUNTRIES, ...Array.from(set).sort(function(a, b) {
    return a.localeCompare(b);
  })];
}

// ═══════════════════════════════════════════════════════════════════════
// buildCategoriesList — derives a unique, sorted list of category names.
// Reads the `category` field which can be a string OR string[].
// Always prepends ALL_CATEGORIES.
// ═══════════════════════════════════════════════════════════════════════
export function buildCategoriesList(offers: Offer[]): string[] {
  const set = new Set<string>();
  for (let i = 0; i < offers.length; i++) {
    const cat = offers[i].category;
    if (Array.isArray(cat)) {
      for (let j = 0; j < cat.length; j++) {
        const s = String(cat[j] || '').trim();
        if (s) set.add(s);
      }
    } else if (typeof cat === 'string' && cat.trim()) {
      set.add(cat.trim());
    }
  }
  return [ALL_CATEGORIES, ...Array.from(set).sort(function(a, b) {
    return a.localeCompare(b);
  })];
}

// ═══════════════════════════════════════════════════════════════════════
// offerMatchesCountry — STRICT matcher.
//
// • ALL_COUNTRIES → every offer matches.
// • Specific country → ONLY offers whose `countries` array (or `country`
//   string) contains that exact value (case-insensitive) match.
//   Offers without any country data are hidden when a specific country
//   is selected. "GLOBAL"/"ALL" entries in an offer's countries list
//   also count as a match (so globally-available brands still appear).
// ═══════════════════════════════════════════════════════════════════════
export function offerMatchesCountry(
  offer: Offer,
  selectedCountry: string
): boolean {
  if (selectedCountry === ALL_COUNTRIES) return true;

  const offerData = offer as any;
  const plural = offerData.countries;
  const singular = offerData.country;
  const sel = selectedCountry.toUpperCase().trim();

  if (Array.isArray(plural)) {
    for (let i = 0; i < plural.length; i++) {
      const val = String(plural[i] || '').toUpperCase().trim();
      if (val === sel || val === 'GLOBAL' || val === 'ALL') return true;
    }
    return false;
  }

  if (typeof plural === 'string' && plural.trim()) {
    const val = plural.toUpperCase().trim();
    return val === sel || val === 'GLOBAL' || val === 'ALL';
  }

  if (typeof singular === 'string' && singular.trim()) {
    const val = singular.toUpperCase().trim();
    return val === sel || val === 'GLOBAL' || val === 'ALL';
  }

  // No country data → hide when a specific country is selected.
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
// offerMatchesCategory — STRICT category matcher (shared with App.tsx).
// ═══════════════════════════════════════════════════════════════════════
export function offerMatchesCategory(
  offer: Offer,
  selectedCategory: string
): boolean {
  if (selectedCategory === ALL_CATEGORIES) return true;
  const sel = selectedCategory.toLowerCase().trim();
  if (Array.isArray(offer.category)) {
    for (let i = 0; i < offer.category.length; i++) {
      if (String(offer.category[i] || '').toLowerCase().trim() === sel) return true;
    }
    return false;
  }
  return String(offer.category || '').toLowerCase().trim() === sel;
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

// ─── Searchable Country Picker (dynamic list) ───────────────────────────
const CountryPicker = ({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (c: string) => void;
  options: string[];
}) => {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const list = options.filter((c) =>
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
  countries: string[];
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
    countries,
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
      {/* Country Picker — populated dynamically from Firestore offers */}
      <CountryPicker
        value={selectedCountry}
        onChange={setSelectedCountry}
        options={countries}
      />

      {/* Search + Categories (dynamic) */}
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
          // Skeleton cards — visually lighter than a spinner, feel instant.
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm animate-pulse"
              >
                <div className="h-40 bg-zinc-100" />
                <div className="p-4">
                  <div className="h-4 w-24 bg-zinc-100 rounded mb-2" />
                  <div className="h-3 w-48 bg-zinc-100 rounded mb-1" />
                  <div className="h-3 w-32 bg-zinc-100 rounded mb-4" />
                  <div className="flex items-center justify-between">
                    <div className="h-6 w-16 bg-zinc-100 rounded" />
                    <div className="h-8 w-20 bg-zinc-100 rounded-xl" />
                  </div>
                </div>
              </div>
            ))}
          </>
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
              No rewards{selectedCountry !== ALL_COUNTRIES ? ` in ${selectedCountry}` : ''}
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
