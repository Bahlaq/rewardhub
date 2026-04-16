// App.tsx — v13.5.0 (2026-04-16). Push restored with safety wrapper, splash
// loader removed, iOS prep (ATT request + platform guards).
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Gift, User, LayoutDashboard, PlayCircle, TrendingUp, AlertCircle,
  X, ChevronRight, Zap, History, Copy, ExternalLink, ShieldCheck, Trash2
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { Toast } from '@capacitor/toast';
import { Browser } from '@capacitor/browser';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Offer, UserProfile, Transaction } from './types';
import { useAds, initAdMobEarly } from './hooks/useAds';
import { firebaseService, FirebaseUser, isConfigValid } from './services/firebase';
import { initPushNotifications } from './services/notifications';
import { APP_NAME, APP_VERSION } from './constants';
import {
  HomeScreen,
  offerMatchesCountry,
  offerMatchesCategory,
  recordUnlock,
  buildCountriesList,
  buildCategoriesList,
  ALL_COUNTRIES,
  ALL_CATEGORIES,
} from './components/HomeScreen';
import icon from '../assets/icon.png';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Cooldown ───────────────────────────────────────────────────
var CD_MS = 2 * 60 * 1000;
var CD_KEY = 'rh_cd';

function loadCD(): { s: number } | null {
  try {
    var raw = localStorage.getItem(CD_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (Date.now() - parsed.s >= CD_MS) {
      localStorage.removeItem(CD_KEY);
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

// ─── Small Components ───────────────────────────────────────────
var Logo = function(props: { className?: string }) {
  return (
    <div className={cn('relative w-full mx-auto', props.className)}>
      <img
        src={icon}
        alt={APP_NAME}
        className="w-full h-auto object-contain rounded-[2.5rem] shadow-2xl"
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

var Navbar = function(props: { tab: string; setTab: (t: string) => void }) {
  var tabs = [
    { id: 'offers', Icon: LayoutDashboard, label: 'Rewards' },
    { id: 'profile', Icon: User, label: 'Profile' },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-200 px-6 pt-3 z-50"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      <div className="max-w-md mx-auto flex justify-between">
        {tabs.map(function(t) {
          return (
            <button
              key={t.id}
              onClick={function() { props.setTab(t.id); }}
              className={cn(
                'flex flex-col items-center gap-1',
                props.tab === t.id ? 'text-indigo-600' : 'text-zinc-400'
              )}
            >
              <t.Icon size={20} strokeWidth={props.tab === t.id ? 2.5 : 2} />
              <span className="text-[10px] font-medium uppercase tracking-wider">
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

var Header = function(props: { user: UserProfile }) {
  return (
    <header
      className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-zinc-100 px-5 pb-2 z-40"
      style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      <div className="max-w-md mx-auto flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Logo className="max-w-[36px]" />
          <div>
            <h1 className="text-base font-black text-zinc-900 leading-none">{APP_NAME}</h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">
              Earn while you play
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
          <Zap size={14} className="text-indigo-600 fill-indigo-600" />
          <span className="text-sm font-bold text-indigo-700">
            {Math.max(0, Number(props.user.points || 0))} pts
          </span>
        </div>
      </div>
    </header>
  );
};

var WebAdModal = function(props: {
  isOpen: boolean;
  onDone: () => void;
  onSkip: () => void;
  num: number;
  total: number;
}) {
  var [t, setT] = useState(5);
  var [fin, setFin] = useState(false);

  useEffect(function() {
    if (!props.isOpen) return;
    setT(5);
    setFin(false);
    var i = setInterval(function() {
      setT(function(p) {
        if (p <= 1) {
          clearInterval(i);
          setFin(true);
          return 0;
        }
        return p - 1;
      });
    }, 1000);
    return function() { clearInterval(i); };
  }, [props.isOpen]);

  if (!props.isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-black/90">
      <div className="w-full max-w-sm bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800">
        <div className="relative aspect-video bg-zinc-800 flex items-center justify-center">
          <PlayCircle size={48} className="text-zinc-600 animate-pulse" />
          <div className="absolute top-4 left-4 bg-indigo-500/80 px-3 py-1 rounded-full text-white text-xs font-bold">
            {props.num}/{props.total}
          </div>
          <div className="absolute top-4 right-4 bg-black/50 px-3 py-1 rounded-full text-white text-xs font-bold">
            {fin ? '✓' : t + 's'}
          </div>
        </div>
        <div className="p-6 text-center">
          <h3 className="text-lg font-bold text-white mb-2">Sponsored Content</h3>
          <button
            onClick={function() { if (fin) { props.onDone(); } else { props.onSkip(); } }}
            className={cn(
              'w-full py-3 rounded-2xl font-bold mt-4',
              fin ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-500'
            )}
          >
            {fin ? 'Continue' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  );
};

var SimpleModal = function(props: {
  open: boolean;
  close: () => void;
  children: React.ReactNode;
}) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={props.close}
        className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
      >
        <div className="p-8">{props.children}</div>
      </motion.div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════
// saveFcmToken — persists an FCM token to Firestore with retries.
//
// Written as a module-level helper (not a hook) so it can be invoked
// from inside the push listener callback without needing React state
// or a ref. Calls `firebaseService.saveFcmToken(uid, token, platform)`
// which is the canonical write path; if that method is missing on the
// service layer, we log a clear error rather than crashing.
//
// Retry policy: 3 attempts with exponential backoff (1s, 2s, 4s) to
// survive transient offline / Firestore rate-limit states. Anything
// beyond attempt #3 is almost certainly a persistent quota or rules
// issue — we surface it in the console for the dev to investigate.
// ═════════════════════════════════════════════════════════════════
async function saveFcmToken(uid: string, token: string): Promise<boolean> {
  if (!uid || !token) {
    console.warn('[FCM] saveFcmToken called with missing uid or token');
    return false;
  }

  const platform = Capacitor.getPlatform(); // 'android' | 'ios' | 'web'
  const svc = firebaseService as any;

  if (typeof svc.saveFcmToken !== 'function') {
    console.error(
      '[FCM] firebaseService.saveFcmToken(uid, token, platform) is missing. ' +
      'Add it to src/services/firebase.ts — it should setDoc(' +
      'doc(db, "fcm_tokens", uid), { token, platform, updatedAt: serverTimestamp() }, ' +
      '{ merge: true }).'
    );
    return false;
  }

  const delays = [1000, 2000, 4000]; // ms — attempts 1, 2, 3
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await svc.saveFcmToken(uid, token, platform);
      console.log('[FCM] token saved on attempt ' + (attempt + 1));
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[FCM] save attempt ' + (attempt + 1) + ' failed: ' + msg);
      if (attempt < 2) {
        await new Promise(function (r) { setTimeout(r, delays[attempt]); });
      }
    }
  }
  console.error('[FCM] all 3 save attempts failed — giving up');
  return false;
}

// ═════════════════════════════════════════════════════════════════
// requestATTIfNeeded — iOS App Tracking Transparency prompt.
//
// Apple requires a user prompt before an app can access the IDFA. Not
// calling this means AdMob falls back to non-personalized ads on iOS
// 14.5+, which cuts eCPM significantly. No-op on Android / web.
//
// Uses a dynamic import so removing the plugin later doesn't break the
// bundle. Fails silently if the plugin isn't installed; AdMob will
// just serve non-personalized ads in that case.
// ═════════════════════════════════════════════════════════════════
async function requestATTIfNeeded(): Promise<void> {
  if (Capacitor.getPlatform() !== 'ios') return;
  try {
    const mod: any = await import('capacitor-plugin-app-tracking-transparency');
    const ATT = mod.AppTrackingTransparency || mod.default;
    if (!ATT) {
      console.log('[ATT] plugin shape unknown — skipping');
      return;
    }
    const status = await ATT.getStatus();
    if (status && status.status === 'notDetermined') {
      const result = await ATT.requestPermission();
      console.log('[ATT] permission result:', result && result.status);
    } else {
      console.log('[ATT] already resolved:', status && status.status);
    }
  } catch (e) {
    console.warn('[ATT] request failed (non-fatal):', e);
  }
}

// ═════════════════════════════════════════════════════════════════
// MAIN APP
// ═════════════════════════════════════════════════════════════════
export default function App() {
  var [tab, setTab] = useState('offers');
  var [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  var [user, setUser] = useState<UserProfile | null>(null);
  var [authLoading, setAuthLoading] = useState(true);
  var [privacyOpen, setPrivacyOpen] = useState(false);
  var [deleteOpen, setDeleteOpen] = useState(false);
  var [confirmOpen, setConfirmOpen] = useState(false);
  var [confirmCfg, setConfirmCfg] = useState({ title: '', msg: '', fn: function() {} });
  var [adRunning, setAdRunning] = useState(false);
  var [webOpen, setWebOpen] = useState(false);
  var [webNum, setWebNum] = useState(1);
  var [webTotal, setWebTotal] = useState(1);
  var webRef = useRef<((v: boolean) => void) | null>(null);

  // ═══════════════════════════════════════════════════════════════
  // v13.2.0 — Crash-proof init refactor.
  //
  // Previous design coupled the App Open Ad to a `notificationsDone`
  // flag. That created two fatal problems:
  //   • If the permission dialog destroyed MainActivity (Cause #1 —
  //     missing configChanges flags on Samsung/Xiaomi OEMs), the flag
  //     was never set in the original instance, and the recreated
  //     activity raced AdMob init against FCM registration.
  //   • The App Open Ad was blocked waiting for a signal that could
  //     never arrive, which is why users saw no ad at all.
  //
  // New design:
  //   • Phase 1 (T+0):   install global error swallowers, warm up
  //     AdMob SDK in the background.
  //   • Phase 2 (T+2s):  show App Open Ad once, independent of any
  //     notification state.
  //   • Phase 3 (T+8s after auth): init push notifications.
  //     By then the App Open Ad has already shown + closed, so FCM
  //     registration no longer competes with ad activity on the main
  //     thread.
  //
  // Each phase is wrapped in try/catch. A failure in one phase does
  // not block the others.
  // ═══════════════════════════════════════════════════════════════
  var appOpenShownRef = useRef(false);

  // ─── Cooldown ─────────────────────────────────────────────────
  var [cdActive, setCdActive] = useState(false);
  var [cdSec, setCdSec] = useState(0);
  var cdInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(function() {
    var saved = loadCD();
    if (saved) {
      var remaining = CD_MS - (Date.now() - saved.s);
      if (remaining > 0) {
        setCdActive(true);
        setCdSec(Math.ceil(remaining / 1000));
        runCooldown(remaining);
      }
    }
    return function() {
      if (cdInterval.current) clearInterval(cdInterval.current);
    };
  }, []);

  function runCooldown(ms: number) {
    if (cdInterval.current) clearInterval(cdInterval.current);
    var endTime = Date.now() + ms;
    setCdActive(true);
    setCdSec(Math.ceil(ms / 1000));
    cdInterval.current = setInterval(function() {
      var remaining = endTime - Date.now();
      if (remaining <= 0) {
        clearInterval(cdInterval.current!);
        cdInterval.current = null;
        setCdActive(false);
        setCdSec(0);
        localStorage.removeItem(CD_KEY);
      } else {
        setCdSec(Math.ceil(remaining / 1000));
      }
    }, 1000);
  }

  function startCooldown() {
    localStorage.setItem(CD_KEY, JSON.stringify({ s: Date.now() }));
    runCooldown(CD_MS);
  }

  // ─── Country ──────────────────────────────────────────────────
  var [country, setCountry] = useState<string>(function() {
    return localStorage.getItem('rh_country') || ALL_COUNTRIES;
  });

  var onCountryChange = useCallback(function(c: string) {
    setCountry(c);
    localStorage.setItem('rh_country', c);
  }, []);

  // ─── Auth ─────────────────────────────────────────────────────
  useEffect(function() {
    var unsub = firebaseService.onAuthChange(function(f) {
      setFbUser(f);
      if (!f) setAuthLoading(false);
    });
    return function() { unsub(); };
  }, []);

  // ─── Ads Hook ─────────────────────────────────────────────────
  var {
    offers, isLoading, onOffersChange, showRewardedAdAndWait,
    recordAdWatch, claimBoostReward, showBanner, hideBanner,
    showAppOpenAd, isNative,
  } = useAds(fbUser?.uid);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1 — mount: install global error swallowers + warm AdMob SDK.
  // This runs exactly once, before auth, before notifications, before
  // any ad attempt. Its only job is to make failure modes survivable
  // and to have the AdMob SDK already initialised by the time we try
  // to show the App Open Ad.
  // ═══════════════════════════════════════════════════════════════
  useEffect(function() {
    if (typeof window === 'undefined') return;

    var onUncaught = function(ev: ErrorEvent) {
      console.error('[Global] Uncaught:', ev.message, ev.filename, ev.lineno);
      // Swallow so the Capacitor native bridge doesn't surface the
      // error to Android as an unhandled exception.
      ev.preventDefault();
    };
    var onRejection = function(ev: PromiseRejectionEvent) {
      console.error('[Global] Unhandled rejection:', ev.reason);
      ev.preventDefault();
    };

    window.addEventListener('error', onUncaught);
    window.addEventListener('unhandledrejection', onRejection);

    // Warm up AdMob SDK via the shared useAds singleton (non-blocking).
    if (isNative) {
      // On iOS, request App Tracking Transparency permission BEFORE
      // initialising AdMob — IDFA availability is latched at SDK init,
      // so prompting afterward means we'd ship non-personalized ads for
      // the first session even if the user grants consent.
      requestATTIfNeeded()
        .catch(function(err) { console.warn('[ATT] pre-init threw:', err); })
        .finally(function() {
          initAdMobEarly()
            .then(function(ok) { console.log('[Init] AdMob pre-warm:', ok ? 'ok' : 'failed'); })
            .catch(function(err) { console.warn('[Init] AdMob pre-warm threw:', err); });
        });
    }

    return function() {
      window.removeEventListener('error', onUncaught);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [isNative]);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2 — T+2s: show App Open Ad exactly once per process lifetime.
  // Independent of notifications. Independent of auth. If AdMob
  // wasn't ready, showAppOpenAd() no-ops and logs a warning.
  // ═══════════════════════════════════════════════════════════════
  useEffect(function() {
    if (!isNative) return;
    if (appOpenShownRef.current) return;

    var t = setTimeout(function() {
      if (appOpenShownRef.current) return;
      appOpenShownRef.current = true;
      console.log('[Init] Firing App Open Ad (T+800ms)');
      showAppOpenAd().catch(function(err) {
        console.warn('[Init] App Open Ad non-fatal:', err);
      });
    }, 800);

    return function() { clearTimeout(t); };
  }, [isNative, showAppOpenAd]);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3 — T+10s after auth: init push notifications (Android+iOS).
  //
  // Restored in v13.5.0 with the safety-first wrapper. Fires only
  // after the user is authenticated (so we have a uid to write the
  // token against) and only once per process (pushInitRef).
  //
  // The 10-second delay is the central stability measure: by T+10s
  // the App Open Ad has shown and closed, MainActivity is settled,
  // and Samsung/Xiaomi OEM permission dialogs will no longer race
  // AdMob init on the main thread.
  //
  // On token receipt, saveFcmToken() writes to Firestore with 3x
  // exponential-backoff retries, so transient offline states don't
  // silently drop the token.
  // ═══════════════════════════════════════════════════════════════
  var pushInitRef = useRef(false);

  useEffect(function() {
    if (!isNative) return;
    if (!fbUser?.uid) return;
    if (pushInitRef.current) return;

    var uid = fbUser.uid;
    var t = setTimeout(function() {
      if (pushInitRef.current) return;
      pushInitRef.current = true;
      console.log('[Init] Phase 3 — init push notifications (T+10s)');

      initPushNotifications(function(token) {
        // Listener callback — fire-and-forget save. saveFcmToken has
        // its own retry loop and swallowed errors.
        saveFcmToken(uid, token).catch(function(err) {
          console.error('[FCM] saveFcmToken threw outside retry loop:', err);
        });
      }).catch(function(err) {
        console.error('[Init] Phase 3 init push threw:', err);
      });
    }, 10000);

    return function() { clearTimeout(t); };
  }, [isNative, fbUser?.uid]);

  // ─── Firestore Listeners ──────────────────────────────────────
  var [fsClaims, setFsClaims] = useState<Transaction[]>([]);
  var [fsHistory, setFsHistory] = useState<Transaction[]>([]);

  useEffect(function() {
    if (!fbUser?.uid) {
      setUser(null);
      setFsClaims([]);
      setFsHistory([]);
      return;
    }

    var uid = fbUser.uid;
    setAuthLoading(true);
    firebaseService.checkDailyReset(uid);

    var u1 = firebaseService.onProfileChange(uid, function(p) {
      if (p) {
        setUser(p);
      } else {
        firebaseService.saveUserProfile({
          uid: uid,
          email: fbUser.email || (uid.startsWith('local_guest_') ? 'Guest User' : 'Unknown'),
          points: 0,
          claimsToday: 0,
          lastClaimDate: null,
          totalEarned: 0,
          boostLevel: 1,
          adsWatchedToday: 0,
          currentLevelAdCounter: 0,
          lastBoostDate: new Date().toDateString(),
        });
      }
      setAuthLoading(false);
    });

    var u2 = firebaseService.onClaimsChange(uid, setFsClaims);
    var u3 = firebaseService.onHistoryChange(uid, setFsHistory);

    return function() { u1(); u2(); u3(); };
  }, [fbUser?.uid]);

  // ─── Search, Categories, Transactions ────────────────────────
  var [searchQuery, setSearchQuery] = useState('');
  var [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORIES);

  // ═══════════════════════════════════════════════════════════════
  // DYNAMIC FILTER LISTS — derived from the offers snapshot.
  // Updates automatically whenever Firestore pushes a new offers[]
  // because offers is the only dep. Adding a new country or category
  // value to any offer document in the `offers` collection causes the
  // dropdown to reflect it on the next snapshot — no redeploy needed.
  // ═══════════════════════════════════════════════════════════════
  var categories = useMemo(function() {
    return buildCategoriesList(offers);
  }, [offers]);

  var countries = useMemo(function() {
    return buildCountriesList(offers);
  }, [offers]);

  // If the currently-selected country/category is no longer present in
  // the list (e.g. the last offer tagged with it was removed in Firestore),
  // gracefully reset to the "All" sentinel.
  useEffect(function() {
    if (countries.indexOf(country) === -1) {
      setCountry(ALL_COUNTRIES);
      localStorage.setItem('rh_country', ALL_COUNTRIES);
    }
  }, [countries, country]);

  useEffect(function() {
    if (categories.indexOf(selectedCategory) === -1) {
      setSelectedCategory(ALL_CATEGORIES);
    }
  }, [categories, selectedCategory]);

  var [localTx, setLocalTx] = useState<Transaction[]>(function() {
    try {
      return JSON.parse(localStorage.getItem('local_transactions') || '[]');
    } catch (e) {
      return [];
    }
  });

  var transactions = useMemo(function() {
    var all = localTx.concat(fsClaims).concat(fsHistory);
    var map = new Map<string, Transaction>();
    for (var i = 0; i < all.length; i++) {
      map.set(all[i].id, all[i]);
    }
    var unique = Array.from(map.values());
    unique.sort(function(a, b) {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
    return unique;
  }, [localTx, fsClaims, fsHistory]);

  useEffect(function() {
    localStorage.setItem('local_transactions', JSON.stringify(localTx.slice(0, 50)));
  }, [localTx]);

  var displayPoints = useMemo(function() {
    var total = 0;
    for (var i = 0; i < transactions.length; i++) {
      var t = transactions[i];
      if (t.type === 'earn') total += t.amount;
      else if (t.type === 'claim') total -= t.amount;
    }
    return Math.max(0, total);
  }, [transactions]);

  // ─── Offers ───────────────────────────────────────────────────
  useEffect(function() {
    var unsub = onOffersChange();
    return function() { unsub(); };
  }, [onOffersChange]);

  // ─── Filtered Offers ──────────────────────────────────────────
  // Strict rules:
  //   • ALL_CATEGORIES + ALL_COUNTRIES ⇒ everything passes the filter.
  //   • Specific category  ⇒ offer's `category` (string or string[]) must include it.
  //   • Specific country   ⇒ offer's `countries`/`country` must include it
  //                           (or contain "GLOBAL"/"ALL" to match any country).
  //     Offers with no country data are hidden when a specific country is picked.
  var filteredOffers = useMemo(function() {
    var result: Offer[] = [];

    for (var i = 0; i < offers.length; i++) {
      var o = offers[i];

      // 1. Category filter (strict)
      if (!offerMatchesCategory(o, selectedCategory)) continue;

      // 2. Country filter (strict)
      if (!offerMatchesCountry(o, country)) continue;

      // 3. Search filter
      if (searchQuery) {
        var q = searchQuery.toLowerCase();
        var brandMatch = o.brand.toLowerCase().indexOf(q) !== -1;
        var descMatch = o.description.toLowerCase().indexOf(q) !== -1;
        if (!brandMatch && !descMatch) continue;
      }

      result.push(o);
    }

    console.log('[Filter] ' + offers.length + ' → ' + result.length + ' (country=' + country + ', cat=' + selectedCategory + ')');
    return result;
  }, [offers, searchQuery, selectedCategory, country]);

  // ─── Banner ───────────────────────────────────────────────────
  useEffect(function() {
    if (isNative && tab === 'offers' && !adRunning) {
      showBanner();
    } else if (isNative) {
      hideBanner();
    }
  }, [tab, adRunning, isNative, showBanner, hideBanner]);

  // ─── Web Ad Simulator ────────────────────────────────────────
  var showWebAd = useCallback(function(num: number, total: number): Promise<boolean> {
    return new Promise(function(resolve) {
      webRef.current = resolve;
      setWebNum(num);
      setWebTotal(total);
      setWebOpen(true);
    });
  }, []);

  var onWebDone = useCallback(function() {
    setWebOpen(false);
    if (webRef.current) { webRef.current(true); webRef.current = null; }
  }, []);

  var onWebSkip = useCallback(function() {
    setWebOpen(false);
    if (webRef.current) { webRef.current(false); webRef.current = null; }
  }, []);

  // ─── Watch Ad Flow ───────────────────────────────────────────
  var handleWatchAd = async function() {
    if (adRunning || !user || cdActive) return;
    setAdRunning(true);
    if (isNative) await hideBanner();

    var boostLevel = Number(user.boostLevel) || 1;
    var currentProgress = Number(user.currentLevelAdCounter) || 0;
    var adsNeeded = boostLevel;
    var remaining = adsNeeded - currentProgress;

    if (remaining <= 0) {
      await handleClaimBoost();
      startCooldown();
      setAdRunning(false);
      if (isNative) showBanner();
      return;
    }

    var completed = 0;
    for (var i = 0; i < remaining; i++) {
      var adNum = currentProgress + i + 1;
      var ok = isNative
        ? await showRewardedAdAndWait()
        : await showWebAd(adNum, adsNeeded);

      if (!ok) {
        Toast.show({ text: 'Ad not completed.', duration: 'short' });
        break;
      }

      var result = await recordAdWatch();
      if (result) {
        completed++;
        if (adNum < adsNeeded) {
          Toast.show({ text: 'Ad ' + adNum + '/' + adsNeeded + '!', duration: 'short' });
          await new Promise(function(r) { setTimeout(r, 800); });
        }
      }
    }

    if (completed === remaining) {
      await handleClaimBoost();
      startCooldown();
    }

    setAdRunning(false);
    if (isNative && tab === 'offers') showBanner();
  };

  var handleClaimBoost = async function() {
    try {
      var result = await claimBoostReward();
      if (result) {
        Toast.show({ text: '+100 pts!', duration: 'long' });
      }
    } catch (e) {
      Toast.show({ text: 'Claim failed.', duration: 'short' });
    }
  };

  // ─── Claim Offer ─────────────────────────────────────────────
  var handleClaimOffer = async function(offer: Offer, cost: number) {
    if (!user) return;

    if (user.points < cost) {
      setConfirmCfg({
        title: 'Not Enough Points',
        msg: 'Need ' + (cost - user.points) + ' more.',
        fn: handleWatchAd,
      });
      setConfirmOpen(true);
      return;
    }

    try {
      await firebaseService.claimOffer(user.uid, offer);
      recordUnlock(offer.id);

      if (!offer.code) {
        Browser.open({ url: offer.url });
      } else {
        setConfirmCfg({
          title: 'Success!',
          msg: 'Code: ' + offer.code,
          fn: function() {
            Clipboard.write({ string: offer.code! });
            Toast.show({ text: 'Copied!', duration: 'short' });
          },
        });
        setConfirmOpen(true);
      }
    } catch (e) {
      Toast.show({ text: 'Failed.', duration: 'long' });
    }
  };

  // ─── Auth Handlers ───────────────────────────────────────────
  var handleSignIn = async function() {
    setAuthLoading(true);
    try {
      var u = await firebaseService.signInWithGoogle();
      if (u) {
        setFbUser(u);
        Toast.show({ text: 'Signed in!', duration: 'short' });
      }
    } catch (e) {
      var msg = e instanceof Error ? e.message : String(e);
      Toast.show({ text: msg.slice(0, 100), duration: 'long' });
    } finally {
      setAuthLoading(false);
    }
  };

  var handleGuest = async function() {
    setAuthLoading(true);
    try {
      var f = await firebaseService.signInAnonymously();
      setFbUser(f);
    } catch (e) {
      var id = localStorage.getItem('persistent_guest_id');
      if (!id) {
        id = 'local_guest_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('persistent_guest_id', id);
      }
      setFbUser({ uid: id, isAnonymous: true } as any);
      setUser({
        uid: id,
        email: 'Guest User',
        points: 0,
        claimsToday: 0,
        lastClaimDate: null,
        totalEarned: 0,
      });
    } finally {
      setAuthLoading(false);
    }
  };

  var handleSignOut = async function() {
    try { await firebaseService.logout(); } catch (e) { /* silent */ }
    setFbUser(null);
    setUser(null);
  };

  var handleDelete = async function() {
    if (!user) return;
    setAuthLoading(true);
    try {
      await firebaseService.deleteUserProfile(user.uid);
      if (!user.uid.startsWith('local_guest_')) {
        await firebaseService.deleteAccount();
      }
      Toast.show({ text: 'Deleted', duration: 'long' });
    } catch (e: any) {
      Toast.show({
        text: e && e.code === 'auth/requires-recent-login' ? 'Re-sign in first.' : 'Failed.',
        duration: 'long',
      });
    } finally {
      setFbUser(null);
      setUser(null);
      setAuthLoading(false);
      setDeleteOpen(false);
    }
  };

  // ─── Screens ─────────────────────────────────────────────────
  if (!isConfigValid) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-6">
        <AlertCircle size={48} className="text-rose-500 mb-4" />
        <h1 className="text-xl font-bold">Config Error</h1>
      </div>
    );
  }

  // v13.5.0 — Splash loader removed for faster, more direct entry.
  // While auth is still resolving we render nothing, so the native
  // Capacitor splash (controlled by capacitor.config.ts) stays visible
  // for a beat before the main UI takes over. No JS-side loading bar
  // between splash and content — this matches user expectation of an
  // instant launch.
  if (authLoading) {
    return null;
  }

  if (!fbUser) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-full max-w-sm flex flex-col items-center">
          <Logo className="max-w-[160px]" />
          <h1 className="text-3xl font-black text-zinc-900 mt-8 mb-3">
            Welcome to {APP_NAME}
          </h1>
          <p className="text-sm text-zinc-500 mb-10">Sign in to earn points.</p>
          <div className="w-full space-y-4">
            <button
              onClick={handleSignIn}
              className="w-full bg-white border border-zinc-200 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-sm active:scale-95"
            >
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                alt="G"
                className="w-5 h-5"
              />
              Continue with Google
            </button>
            <button
              onClick={handleGuest}
              className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg active:scale-95"
            >
              <User size={20} /> Continue as Guest
            </button>
          </div>
          <p className="mt-12 text-[10px] text-zinc-400 uppercase tracking-widest">
            v{APP_VERSION}
          </p>
        </div>
      </div>
    );
  }

  // v13.5.0 — Profile-loading fallback is now a render-nothing so there's
  // no flash of a secondary loader between auth and first Firestore
  // snapshot. HomeScreen already handles the isLoading=true state with
  // skeleton cards once the main tree mounts, so this null is safe.
  if (!user) {
    return null;
  }

  // ─── Main Layout ─────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-zinc-50 font-sans overflow-hidden">
      <div className="flex-1 overflow-y-auto scroll-smooth relative">
        <Header user={{ ...user, points: displayPoints }} />
        <main className="max-w-md mx-auto px-6 py-6 pb-[120px]">
          <AnimatePresence mode="wait">
            {tab === 'offers' && (
              <HomeScreen
                user={{ ...user, points: displayPoints }}
                offers={offers}
                isLoading={isLoading}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                categories={categories}
                countries={countries}
                filteredOffers={filteredOffers}
                transactions={transactions}
                handleWatchAd={handleWatchAd}
                handleClaimOffer={handleClaimOffer}
                handleClaimBoostReward={handleClaimBoost}
                isAdRunning={adRunning}
                selectedCountry={country}
                setSelectedCountry={onCountryChange}
                isCooldownActive={cdActive}
                cooldownSecondsLeft={cdSec}
              />
            )}

            {tab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                {/* Profile Card */}
                <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm text-center">
                  <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <User size={40} className="text-indigo-600" />
                  </div>
                  <h2 className="text-xl font-bold text-zinc-900">{user.email}</h2>
                  <p className="text-xs text-zinc-500 mt-1">v{APP_VERSION}</p>
                  <div className="grid grid-cols-2 gap-4 mt-8">
                    <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                      <span className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Points</span>
                      <span className="text-lg font-bold text-zinc-900">{displayPoints}</span>
                    </div>
                    <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                      <span className="block text-[10px] uppercase font-bold text-zinc-400 mb-1">Claims</span>
                      <span className="text-lg font-bold text-zinc-900">
                        {transactions.filter(function(t) { return t.type === 'claim'; }).length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-3">
                  <button onClick={function() { setPrivacyOpen(true); }} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm">
                    <div className="flex items-center gap-3"><ShieldCheck size={20} className="text-indigo-600" /><span className="text-sm font-bold text-zinc-700">Privacy Policy</span></div>
                    <ChevronRight size={18} className="text-zinc-400" />
                  </button>
                  <button onClick={handleSignOut} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-200 shadow-sm">
                    <div className="flex items-center gap-3"><ExternalLink size={20} className="text-zinc-400" /><span className="text-sm font-bold text-zinc-700">Sign Out</span></div>
                    <ChevronRight size={18} className="text-zinc-400" />
                  </button>
                  <button onClick={function() { setDeleteOpen(true); }} className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-rose-200 shadow-sm">
                    <div className="flex items-center gap-3"><Trash2 size={20} className="text-rose-500" /><span className="text-sm font-bold text-rose-600">Delete Account</span></div>
                    <ChevronRight size={18} className="text-rose-400" />
                  </button>
                </div>

                {/* History */}
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">History</h2>
                  {transactions.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 border border-dashed border-zinc-200 text-center">
                      <History size={24} className="text-zinc-300 mx-auto mb-2" />
                      <p className="text-xs text-zinc-500">No transactions</p>
                    </div>
                  ) : (
                    transactions.slice(0, 20).map(function(tx) {
                      return (
                        <div key={tx.id} className="bg-white rounded-2xl p-4 border border-zinc-200 shadow-sm flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', tx.type === 'earn' ? 'bg-emerald-50' : 'bg-indigo-50')}>
                              {tx.type === 'earn' ? <TrendingUp size={16} className="text-emerald-600" /> : <Gift size={16} className="text-indigo-600" />}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-zinc-900">{tx.title}</p>
                              <p className="text-[10px] text-zinc-400">{new Date(tx.timestamp).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={cn('text-sm font-bold', tx.type === 'earn' ? 'text-emerald-600' : 'text-indigo-600')}>
                              {tx.type === 'earn' ? '+' : '-'}{Math.abs(tx.amount)} pts
                            </span>
                            {tx.code && (
                              <button
                                onClick={async function() {
                                  await Clipboard.write({ string: tx.code! });
                                  Toast.show({ text: 'Copied!', duration: 'short' });
                                }}
                                className="block text-[10px] font-mono bg-zinc-100 px-2 py-0.5 rounded text-zinc-600 border border-zinc-200 mt-1"
                              >
                                {tx.code}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div className="h-40" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <Navbar tab={tab} setTab={setTab} />

      <WebAdModal isOpen={webOpen} onDone={onWebDone} onSkip={onWebSkip} num={webNum} total={webTotal} />

      <SimpleModal open={privacyOpen} close={function() { setPrivacyOpen(false); }}>
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck size={24} className="text-indigo-600" />
          <h3 className="text-xl font-black text-zinc-900">Privacy Policy</h3>
        </div>
        <div className="text-sm text-zinc-600 space-y-3 max-h-[40vh] overflow-y-auto">
          <p className="font-bold text-zinc-900">Data:</p>
          <p>Email and activity for functionality only.</p>
          <p className="font-bold text-zinc-900">Deletion:</p>
          <p>Delete anytime from Profile.</p>
          <p className="font-bold text-zinc-900">Ads:</p>
          <p>Google AdMob. We never sell your data.</p>
        </div>
        <button onClick={function() { setPrivacyOpen(false); }} className="w-full mt-6 bg-indigo-600 text-white py-4 rounded-2xl font-bold active:scale-95">Got it</button>
      </SimpleModal>

      <SimpleModal open={deleteOpen} close={function() { setDeleteOpen(false); }}>
        <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mb-6">
          <AlertCircle size={24} className="text-rose-600" />
        </div>
        <h3 className="text-xl font-black text-zinc-900 mb-2">Delete Account?</h3>
        <p className="text-sm text-zinc-500 mb-6">This is permanent. All data will be lost.</p>
        <button onClick={handleDelete} className="w-full bg-rose-600 text-white py-4 rounded-2xl font-bold active:scale-95 mb-3">Delete</button>
        <button onClick={function() { setDeleteOpen(false); }} className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold active:scale-95">Cancel</button>
      </SimpleModal>

      <SimpleModal open={confirmOpen} close={function() { setConfirmOpen(false); }}>
        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
          <AlertCircle size={24} className="text-indigo-600" />
        </div>
        <h3 className="text-xl font-black text-zinc-900 mb-2">{confirmCfg.title}</h3>
        <p className="text-sm text-zinc-500 mb-6">{confirmCfg.msg}</p>
        <button onClick={function() { confirmCfg.fn(); setConfirmOpen(false); }} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold active:scale-95 mb-3">Confirm</button>
        <button onClick={function() { setConfirmOpen(false); }} className="w-full bg-zinc-100 text-zinc-600 py-4 rounded-2xl font-bold active:scale-95">Cancel</button>
      </SimpleModal>
    </div>
  );
}
