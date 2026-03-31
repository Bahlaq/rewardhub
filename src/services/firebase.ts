import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  collection,
  query,
  where,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  signInAnonymously as fbSignInAnonymously,
  deleteUser,
  User as FirebaseUser,
  signInWithCredential,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { Offer, UserProfile, Transaction } from '../types';

// ─── Verified Credentials ──────────────────────────────────────────────────
const WEB_CLIENT_ID =
  '563861371307-cg3bnlt6j34r88odgtn5t5816o6dlchc.apps.googleusercontent.com';

const firebaseConfig = {
  apiKey:            'AIzaSyBLlefWEa3WHUSPD0_sDTvpCTqIImh5X6Y',
  authDomain:        'rewardhub-1ea27.firebaseapp.com',
  projectId:         'rewardhub-1ea27',
  storageBucket:     'rewardhub-1ea27.firebasestorage.app',
  messagingSenderId: '563861371307',
  appId:             '1:563861371307:web:7db5542c5b2f2e46247aee',
};

// ─── Capacitor Google Auth lazy-load ───────────────────────────────────────
let GoogleAuthInstance: any = null;

async function loadGoogleAuth(): Promise<any> {
  if (GoogleAuthInstance) return GoogleAuthInstance;
  const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
  GoogleAuthInstance = GoogleAuth;
  try {
    (GoogleAuth as any).initialize({
      clientId:           WEB_CLIENT_ID,
      serverClientId:     WEB_CLIENT_ID,
      scopes:             ['profile', 'email'],
      grantOfflineAccess: true,
    });
    console.log('[GoogleAuth] Initialized');
  } catch (err) {
    console.error('[GoogleAuth] initialize() error:', err);
  }
  return GoogleAuth;
}

// Pre-load on native to reduce first-tap latency
if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
  loadGoogleAuth().catch((e) => console.error('[GoogleAuth] Pre-load failed:', e));
}

// ─── Firebase init ─────────────────────────────────────────────────────────
export const isConfigValid = true;

let _app: ReturnType<typeof initializeApp> | undefined;
try {
  _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (e) {
  console.error('[Firebase] Init error:', e);
}

// experimentalForceLongPolling ensures connectivity in WebView / restricted networks
const db = _app
  ? initializeFirestore(_app, { experimentalForceLongPolling: true })
  : null;

const auth = _app ? getAuth(_app) : null;

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ client_id: WEB_CLIENT_ID });

export { auth, googleProvider, db };
export type { FirebaseUser };

// ─── Utilities ─────────────────────────────────────────────────────────────

/** Picks 'guests' for local-fallback IDs, 'users' for real Firebase UIDs */
function col(uid: string): 'guests' | 'users' {
  return uid.startsWith('local_guest_') ? 'guests' : 'users';
}

function saveLocal(uid: string, data: Partial<UserProfile>): void {
  try {
    const prev = getLocal(uid) ?? ({} as UserProfile);
    localStorage.setItem(`profile_${uid}`, JSON.stringify({ ...prev, ...data }));
  } catch (_) { /* storage may be unavailable */ }
}

function getLocal(uid: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(`profile_${uid}`);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch (_) {
    return null;
  }
}

function defaultProfile(uid: string, email: string): UserProfile {
  return {
    uid,
    email,
    points:               0,
    claimsToday:          0,
    lastClaimDate:        null,
    totalEarned:          0,
    boostLevel:           1,
    adsWatchedToday:      0,
    currentLevelAdCounter: 0,
    lastBoostDate:        new Date().toDateString(),
  };
}

/**
 * Race a promise against a timeout.
 * If the promise doesn't resolve within `ms` milliseconds the timeout
 * rejects with a human-readable error message.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(msg)), ms)
    ),
  ]);
}

// ─── Firebase Service ───────────────────────────────────────────────────────
export const firebaseService = {

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Google Sign-In.
   *
   * Native (Android/iOS):
   *   1. Load Capacitor Google Auth plugin (10 s timeout).
   *   2. Call GA.signIn() (30 s timeout — prevents infinite spinner).
   *   3. Extract idToken and sign in to Firebase with the credential.
   *
   * Web: standard Firebase popup.
   */
  async signInWithGoogle(): Promise<FirebaseUser> {
    if (!auth) throw new Error('Firebase Auth not initialized');

    if (Capacitor.isNativePlatform()) {
      // Load plugin with a timeout so we never hang silently
      const GA = await withTimeout(
        loadGoogleAuth(),
        10_000,
        'Google Auth plugin failed to load. Please restart the app.'
      );

      console.log('[GoogleAuth] Calling signIn()…');

      // 30-second hard timeout — if the OS sheet never appears/resolves
      const googleUser = await withTimeout(
        GA.signIn(),
        30_000,
        'Google Sign-In timed out. Check your internet connection and try again.'
      );

      console.log('[GoogleAuth] signIn() resolved — email:', googleUser?.email);

      // The idToken field location differs between plugin versions
      const idToken: string | undefined =
        googleUser?.authentication?.idToken ??
        (googleUser as any)?.idToken;

      if (!idToken) {
        throw new Error(
          'Google Sign-In did not return an ID Token.\n\n' +
          'Common fixes:\n' +
          '• Add the correct SHA-1 fingerprint in Firebase Console → Project Settings → Your Android App.\n' +
          '• Make sure google-services.json is re-downloaded after adding the SHA-1.\n' +
          '• Confirm the OAuth 2.0 Web Client exists in Google Cloud Console.'
        );
      }

      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      console.log('[Firebase] signInWithCredential OK — uid:', result.user.uid);

      await this._ensureProfile(result.user.uid, result.user.email ?? 'Google User');
      return result.user;
    }

    // Web fallback
    const result = await signInWithPopup(auth, googleProvider);
    await this._ensureProfile(result.user.uid, result.user.email ?? 'Google User');
    return result.user;
  },

  async signInAnonymously(): Promise<FirebaseUser> {
    if (!auth) throw new Error('Firebase Auth not initialized');
    const result = await fbSignInAnonymously(auth);
    await this._ensureProfile(result.user.uid, 'Guest User');
    return result.user;
  },

  async logout(): Promise<void> {
    if (auth) await signOut(auth);
  },

  async deleteAccount(): Promise<void> {
    if (auth?.currentUser) await deleteUser(auth.currentUser);
  },

  async deleteUserProfile(uid: string): Promise<void> {
    if (!db) return;
    await deleteDoc(doc(db, col(uid), uid));
  },

  onAuthChange(cb: (user: FirebaseUser | null) => void): () => void {
    if (!auth) { cb(null); return () => {}; }
    return onAuthStateChanged(auth, cb);
  },

  // ── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Writes a default profile document only when one doesn't exist yet.
   * Safe to call on every sign-in — uses { merge: true } to never overwrite data.
   */
  async _ensureProfile(uid: string, email: string): Promise<void> {
    if (!db) return;
    const ref = doc(db, col(uid), uid);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        const profile = defaultProfile(uid, email);
        await setDoc(ref, profile);
        saveLocal(uid, profile);
        console.log('[Profile] Created new profile for', uid);
      } else {
        saveLocal(uid, snap.data() as UserProfile);
      }
    } catch (err: any) {
      console.error('[Profile] _ensureProfile error:', err.code ?? err.message);
    }
  },

  // ── Real-time listeners ───────────────────────────────────────────────────

  onProfileChange(
    uid: string,
    cb: (profile: UserProfile | null) => void
  ): () => void {
    if (!db) { cb(null); return () => {}; }
    return onSnapshot(
      doc(db, col(uid), uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          saveLocal(uid, data);
          cb(data);
        } else {
          cb(null);
        }
      },
      (err) => {
        console.error('[Firestore] onProfileChange:', err.code, err.message);
        cb(getLocal(uid));
      }
    );
  },

  onOffersChange(cb: (offers: Offer[]) => void): () => void {
    if (!db) { cb([]); return () => {}; }
    return onSnapshot(
      query(collection(db, 'offers')),
      (snapshot) => {
        const offers = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          points: Number(d.data().points ?? 0),
        })) as Offer[];
        cb(offers);
      },
      (err) => {
        console.error('[Firestore] onOffersChange:', err.message);
        cb([]);
      }
    );
  },

  onClaimsChange(uid: string, cb: (claims: Transaction[]) => void): () => void {
    if (!db) { cb([]); return () => {}; }
    return onSnapshot(
      query(collection(db, 'claims'), where('uid', '==', uid)),
      (snapshot) => {
        const claims = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id:         d.id,
            type:       'claim' as const,
            title:      data.offerBrand ?? 'Claimed Offer',
            amount:     Number(data.pointsSpent ?? 0),
            timestamp:  data.timestamp?.toDate?.()?.toISOString() ?? new Date().toISOString(),
            code:       data.code ?? undefined,
            rewardType: data.code ? 'code' : 'link',
          } as Transaction;
        });
        cb(claims);
      },
      (err) => {
        console.error('[Firestore] onClaimsChange:', err.message);
        cb([]);
      }
    );
  },

  onHistoryChange(uid: string, cb: (history: Transaction[]) => void): () => void {
    if (!db) { cb([]); return () => {}; }
    return onSnapshot(
      query(collection(db, 'history'), where('uid', '==', uid)),
      (snapshot) => {
        const history = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id:        d.id,
            type:      'earn' as const,
            // Support both 'message' (rules-required field) and legacy 'title'
            title:     data.message ?? data.title ?? 'Earned Points',
            // Support both 'points' (rules-required field) and legacy 'amount'
            amount:    Math.abs(Number(data.points ?? data.amount ?? 0)),
            timestamp: data.timestamp?.toDate?.()?.toISOString() ?? new Date().toISOString(),
          } as Transaction;
        });
        cb(history);
      },
      (err) => {
        console.error('[Firestore] onHistoryChange:', err.message);
        cb([]);
      }
    );
  },

  // ── Daily Reset ───────────────────────────────────────────────────────────

  /**
   * Compares lastBoostDate to today.
   * If different → resets boostLevel=1, currentLevelAdCounter=0, adsWatchedToday=0.
   *
   * CRITICAL: `points` and `totalEarned` are intentionally NEVER modified here.
   */
  async checkDailyReset(uid: string): Promise<void> {
    if (!db) return;

    const isGuest = uid.startsWith('local_guest_');
    // Avoid permission errors during cold-start when auth hasn't resolved yet
    if (!isGuest && (!auth || !auth.currentUser)) {
      console.log('[DailyReset] Skipped — auth not yet resolved');
      return;
    }

    const ref   = doc(db, col(uid), uid);
    const today = new Date().toDateString();

    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return;

      const data = snap.data();
      if (data.lastBoostDate === today) return; // Already up-to-date

      const resetFields = {
        boostLevel:            1,
        currentLevelAdCounter: 0,
        adsWatchedToday:       0,
        lastBoostDate:         today,
        // points and totalEarned intentionally omitted — they are cumulative
      };

      await setDoc(ref, resetFields, { merge: true });
      saveLocal(uid, { ...(data as UserProfile), ...resetFields });
      console.log('[DailyReset] Reset for', uid, '— points preserved:', data.points);
    } catch (err: any) {
      console.error('[DailyReset] Error:', err.code ?? err.message);
    }
  },

  // ── Progressive Boost ─────────────────────────────────────────────────────

  /**
   * Records one completed ad watch. Increments `currentLevelAdCounter`.
   * Does NOT award points — that happens in `claimBoostReward`.
   *
   * Rule: Level N requires watching exactly N ads before claiming.
   */
  async recordAdWatch(uid: string): Promise<{
    boostLevel:            number;
    currentLevelAdCounter: number;
    adsNeeded:             number;
    adsWatchedToday:       number;
  }> {
    if (!db) throw new Error('Firestore not initialized');

    const ref   = doc(db, col(uid), uid);
    const today = new Date().toDateString();

    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);

      let data: any;
      if (!snap.exists()) {
        data = defaultProfile(uid, auth?.currentUser?.email ?? 'Guest User');
        tx.set(ref, data);
      } else {
        data = snap.data();
      }

      // Apply daily reset inside the transaction (atomic)
      let boostLevel            = Number(data.boostLevel)            || 1;
      let currentLevelAdCounter = Number(data.currentLevelAdCounter) || 0;
      let adsWatchedToday       = Number(data.adsWatchedToday)       || 0;

      if (data.lastBoostDate !== today) {
        boostLevel            = 1;
        currentLevelAdCounter = 0;
        adsWatchedToday       = 0;
      }

      currentLevelAdCounter += 1;

      tx.set(ref, { currentLevelAdCounter, lastBoostDate: today }, { merge: true });
      saveLocal(uid, { ...data, currentLevelAdCounter, lastBoostDate: today });

      console.log(
        `[recordAdWatch] level=${boostLevel} counter=${currentLevelAdCounter}/${boostLevel}`
      );

      return { boostLevel, currentLevelAdCounter, adsNeeded: boostLevel, adsWatchedToday };
    });
  },

  /**
   * Claims the boost reward after the user has watched `boostLevel` ads.
   *
   * Atomically in one Firestore transaction:
   *   • points             += 100
   *   • totalEarned        += 100
   *   • boostLevel         += 1   (next round requires one more ad)
   *   • currentLevelAdCounter = 0
   *   • adsWatchedToday    += 1
   *
   * History document field names MUST match isValidHistory() in firestore.rules:
   *   required keys: ['uid', 'points', 'timestamp', 'type', 'message']
   *   valid types:   ['boost', 'claim', 'referral', 'earn']
   *
   * Previous bug: code was writing { amount, title } → Firestore rules rejected
   * it → "Missing or insufficient permissions" error. Fixed by using { points, message }.
   */
  async claimBoostReward(uid: string): Promise<{
    points:         number;
    boostLevel:     number;
    completedLevel: number;
  }> {
    if (!db) throw new Error('Firestore not initialized');

    const ref     = doc(db, col(uid), uid);
    const histRef = doc(collection(db, 'history'));
    const today   = new Date().toDateString();

    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('User profile not found');

      const data = snap.data();
      const boostLevel            = Number(data.boostLevel)            || 1;
      const currentLevelAdCounter = Number(data.currentLevelAdCounter) || 0;

      if (currentLevelAdCounter < boostLevel) {
        throw new Error(
          `Boost not ready: watched ${currentLevelAdCounter}/${boostLevel} ads`
        );
      }

      const oldPoints      = Number(data.points)       || 0;
      const newPoints      = oldPoints + 100;
      const newTotalEarned = (Number(data.totalEarned) || 0) + 100;
      const newBoostLevel  = boostLevel + 1;
      const completedLevel = boostLevel;

      // ── Update user document ─────────────────────────────────────────────
      tx.set(ref, {
        points:                newPoints,
        totalEarned:           newTotalEarned,
        boostLevel:            newBoostLevel,
        currentLevelAdCounter: 0,
        adsWatchedToday:       (Number(data.adsWatchedToday) || 0) + 1,
        lastBoostDate:         today,
      }, { merge: true });

      // ── Write history entry ──────────────────────────────────────────────
      // Field names match firestore.rules isValidHistory() exactly:
      //   ['uid', 'points', 'timestamp', 'type', 'message']
      tx.set(histRef, {
        uid,
        type:      'earn',
        points:    100,                                            // ← 'points' (NOT 'amount')
        message:   `Daily Boost Level ${completedLevel} Complete`, // ← 'message' (NOT 'title')
        timestamp: serverTimestamp(),
      });

      // Update localStorage cache so UI reflects changes immediately
      saveLocal(uid, {
        ...(data as UserProfile),
        points:                newPoints,
        totalEarned:           newTotalEarned,
        boostLevel:            newBoostLevel,
        currentLevelAdCounter: 0,
        lastBoostDate:         today,
      });

      console.log(
        `[claimBoostReward] Level ${completedLevel} claimed — ` +
        `${oldPoints} → ${newPoints} pts, next level: ${newBoostLevel}`
      );

      return { points: newPoints, boostLevel: newBoostLevel, completedLevel };
    });
  },

  // ── Offer Claiming ────────────────────────────────────────────────────────

  async claimOffer(uid: string, offer: Offer): Promise<boolean> {
    if (!db) throw new Error('Firestore not initialized');

    const ref      = doc(db, col(uid), uid);
    const claimRef = doc(collection(db, 'claims'));

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('User profile not found');

      const data = snap.data() as UserProfile;
      if (data.points < offer.points) throw new Error('Insufficient points');

      tx.update(ref, {
        points:        Number(data.points) - Number(offer.points),
        claimsToday:   (Number(data.claimsToday) || 0) + 1,
        lastClaimDate: new Date().toISOString(),
      });

      tx.set(claimRef, {
        uid,
        offerId:     offer.id,
        offerBrand:  offer.brand,
        code:        offer.code ?? null,
        url:         offer.url,
        pointsSpent: offer.points,
        timestamp:   serverTimestamp(),
      });
    });

    return true;
  },

  // ── Profile CRUD ──────────────────────────────────────────────────────────

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    if (!db) return getLocal(uid);
    try {
      const snap = await getDoc(doc(db, col(uid), uid));
      if (snap.exists()) {
        const p = snap.data() as UserProfile;
        saveLocal(uid, p);
        return p;
      }
      return getLocal(uid);
    } catch (err: any) {
      console.error('[Profile] getUserProfile:', err.code ?? err.message);
      return getLocal(uid);
    }
  },

  async saveUserProfile(profile: UserProfile): Promise<void> {
    saveLocal(profile.uid, profile);
    if (!db) return;
    try {
      await setDoc(doc(db, col(profile.uid), profile.uid), profile, { merge: true });
    } catch (err: any) {
      console.error('[Profile] saveUserProfile:', err.code ?? err.message);
    }
  },

  // Legacy helper kept for any callers using this path directly
  async rewardUserPoints(uid: string, points: number, title: string): Promise<boolean> {
    if (!db) throw new Error('Firestore not initialized');

    const ref     = doc(db, col(uid), uid);
    const histRef = doc(collection(db, 'history'));

    await setDoc(ref, { uid, points: 0, totalEarned: 0 }, { merge: true });

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('User profile not found');
      const data = snap.data() as UserProfile;
      tx.update(ref, {
        points:      (data.points      || 0) + points,
        totalEarned: (data.totalEarned || 0) + points,
      });
      // Use correct field names for firestore.rules isValidHistory()
      tx.set(histRef, {
        uid,
        type:      'earn',
        points,           // ← 'points'
        message:   title, // ← 'message'
        timestamp: serverTimestamp(),
      });
    });

    return true;
  },
};
