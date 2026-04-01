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

// ─────────────────────────────────────────────────────────────────────────────
// CREDENTIAL REFERENCE
//
//  Source: Firebase Console → Project Settings
//
//  Web App (used by Firebase JS SDK):
//    App ID  : 1:563861371307:web:7db5542c5b2f2e46247aee   ← firebaseConfig.appId
//    API Key : AIzaSyBLlefWEa3WHUSPD0_sDTvpCTqIImh5X6Y
//
//  Android App (used by google-services.json / native SDK):
//    App ID  : 1:563861371307:android:30156581fa40b33c247aee
//    API Key : AIzaSyAnhLXDkOWvCxCiNsmD2aDeGIMmdw-h_po
//
//  OAuth Web Client (type 3 — used by Capacitor Google Auth serverClientId):
//    Client ID: 563861371307-cg3bnlt6j34r88odgtn5t5816o6dlchc.apps.googleusercontent.com
//
//  Two Android OAuth clients (type 1) are registered — both SHA-1 fingerprints
//  appear in Firebase Console → Android App → SHA certificate fingerprints. ✓
//
// IMPORTANT: firebaseConfig.appId MUST be the Web App ID for the Firebase JS SDK.
//            Using the Android mobilesdk_app_id here causes Auth/Firestore to fail.
// ─────────────────────────────────────────────────────────────────────────────

const WEB_CLIENT_ID =
  '563861371307-cg3bnlt6j34r88odgtn5t5816o6dlchc.apps.googleusercontent.com';

/** Firebase config uses the WEB app credentials, NOT the Android app credentials. */
const firebaseConfig = {
  apiKey:            'AIzaSyBLlefWEa3WHUSPD0_sDTvpCTqIImh5X6Y',
  authDomain:        'rewardhub-1ea27.firebaseapp.com',
  projectId:         'rewardhub-1ea27',
  storageBucket:     'rewardhub-1ea27.firebasestorage.app',
  messagingSenderId: '563861371307',
  appId:             '1:563861371307:web:7db5542c5b2f2e46247aee', // ← Web App ID (NOT android)
};

// ─── Capacitor Google Auth lazy-load ─────────────────────────────────────────
let GoogleAuthInstance: any = null;

async function loadGoogleAuth(): Promise<any> {
  if (GoogleAuthInstance) return GoogleAuthInstance;
  const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
  GoogleAuthInstance = GoogleAuth;
  try {
    (GoogleAuth as any).initialize({
      clientId:           WEB_CLIENT_ID,   // web client ID used for token request
      serverClientId:     WEB_CLIENT_ID,   // same — required to get back an id_token
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

// ─── Firebase init ────────────────────────────────────────────────────────────
export const isConfigValid = true;

let _app: ReturnType<typeof initializeApp> | undefined;
try {
  _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  console.log('[Firebase] Initialized — project:', firebaseConfig.projectId);
} catch (e) {
  console.error('[Firebase] Init error:', e);
}

const db = _app
  ? initializeFirestore(_app, { experimentalForceLongPolling: true })
  : null;

const auth = _app ? getAuth(_app) : null;

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ client_id: WEB_CLIENT_ID });

export { auth, googleProvider, db };
export type { FirebaseUser };

// ─── Utilities ────────────────────────────────────────────────────────────────

function col(uid: string): 'guests' | 'users' {
  return uid.startsWith('local_guest_') ? 'guests' : 'users';
}

function saveLocal(uid: string, data: Partial<UserProfile>): void {
  try {
    const prev = getLocal(uid) ?? ({} as UserProfile);
    localStorage.setItem(`profile_${uid}`, JSON.stringify({ ...prev, ...data }));
  } catch (_) {}
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
    points:                0,
    claimsToday:           0,
    lastClaimDate:         null,
    totalEarned:           0,
    boostLevel:            1,
    adsWatchedToday:       0,
    currentLevelAdCounter: 0,
    lastBoostDate:         new Date().toDateString(),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(msg)), ms)
    ),
  ]);
}

// ─── Firebase Service ─────────────────────────────────────────────────────────
export const firebaseService = {

  // ── Auth ──────────────────────────────────────────────────────────────────

  async signInWithGoogle(): Promise<FirebaseUser> {
    if (!auth) throw new Error('Firebase Auth not initialized');

    if (Capacitor.isNativePlatform()) {
      const GA = await withTimeout(
        loadGoogleAuth(),
        10_000,
        'Google Auth plugin failed to load. Please restart the app.'
      );

      console.log('[GoogleAuth] Calling signIn()…');

      let googleUser: any;
      try {
        googleUser = await withTimeout(
          GA.signIn(),
          30_000,
          'Google Sign-In timed out after 30 s. Check your internet connection.'
        );
      } catch (err: any) {
        const msg: string = err?.message ?? String(err);
        if (
          msg.includes('10:') ||
          msg.includes('DEVELOPER_ERROR') ||
          msg.includes('sign_in_failed') ||
          msg.includes('ApiException')
        ) {
          throw new Error(
            'Google Sign-In Error 10 — DEVELOPER_ERROR.\n\n' +
            'Your SHA-1 fingerprint is registered in Firebase, but the\n' +
            'google-services.json in android/app/ may be out of date.\n\n' +
            'Fix:\n' +
            '1. Download fresh google-services.json from Firebase Console.\n' +
            '2. Replace android/app/google-services.json.\n' +
            '3. Run: npx cap sync android && npm run build:android'
          );
        }
        throw err;
      }

      console.log('[GoogleAuth] signIn() OK — email:', googleUser?.email);

      const idToken: string | undefined =
        googleUser?.authentication?.idToken ??
        (googleUser as any)?.idToken;

      if (!idToken) {
        throw new Error(
          'Google Sign-In did not return an ID Token.\n' +
          'Ensure the SHA-1 fingerprint is registered in Firebase Console and\n' +
          'that google-services.json was re-downloaded afterwards.'
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

  // ── Internal helpers ───────────────────────────────────────────────────────

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

  // ── Real-time listeners ────────────────────────────────────────────────────

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
            // 'message' = rules-required field; 'title' = legacy fallback
            title:     data.message ?? data.title ?? 'Earned Points',
            // 'points' = rules-required field; 'amount' = legacy fallback
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

  // ── Daily Reset ────────────────────────────────────────────────────────────

  /**
   * Resets boost counters when the calendar date changes.
   * `points` and `totalEarned` are NEVER touched here — they are permanent.
   */
  async checkDailyReset(uid: string): Promise<void> {
    if (!db) return;
    const isGuest = uid.startsWith('local_guest_');
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
      if (data.lastBoostDate === today) return;

      const resetFields = {
        boostLevel:            1,
        currentLevelAdCounter: 0,
        adsWatchedToday:       0,
        lastBoostDate:         today,
        // points and totalEarned intentionally omitted — cumulative / permanent
      };

      await setDoc(ref, resetFields, { merge: true });
      saveLocal(uid, { ...(data as UserProfile), ...resetFields });
      console.log('[DailyReset] Reset — points preserved:', data.points);
    } catch (err: any) {
      console.error('[DailyReset] Error:', err.code ?? err.message);
    }
  },

  // ── Progressive Boost ──────────────────────────────────────────────────────

  /**
   * Records ONE completed ad watch.
   * Increments `currentLevelAdCounter` in a transaction.
   * Returns the Firestore-confirmed state — callers must use this return value
   * and must NOT maintain any additional local counter on top of it.
   *
   * Rule: Level N requires exactly N ad watches before `claimBoostReward` succeeds.
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

      // Apply daily reset atomically if needed
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

      return {
        boostLevel,
        currentLevelAdCounter, // ← Firestore ground truth after increment
        adsNeeded: boostLevel,
        adsWatchedToday,
      };
    });
  },

  /**
   * Claims the boost reward.
   * Validates server-side that currentLevelAdCounter >= boostLevel.
   * Atomically: points += 100, boostLevel += 1, currentLevelAdCounter = 0.
   *
   * History doc field names match isValidHistory() in firestore.rules:
   *   required: ['uid', 'points', 'timestamp', 'type', 'message']
   *   type in:  ['boost', 'claim', 'referral', 'earn']
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

      // Server-side gate — rejects if UI tried to claim too early
      if (currentLevelAdCounter < boostLevel) {
        throw new Error(
          `Cannot claim: only ${currentLevelAdCounter} of ${boostLevel} ads watched.`
        );
      }

      const oldPoints      = Number(data.points)       || 0;
      const newPoints      = oldPoints + 100;
      const newTotalEarned = (Number(data.totalEarned) || 0) + 100;
      const newBoostLevel  = boostLevel + 1;
      const completedLevel = boostLevel;

      tx.set(ref, {
        points:                newPoints,
        totalEarned:           newTotalEarned,
        boostLevel:            newBoostLevel,
        currentLevelAdCounter: 0,
        adsWatchedToday:       (Number(data.adsWatchedToday) || 0) + 1,
        lastBoostDate:         today,
      }, { merge: true });

      // Field names exactly match firestore.rules isValidHistory()
      tx.set(histRef, {
        uid,
        type:      'earn',
        points:    100,                                             // 'points' NOT 'amount'
        message:   `Daily Boost Level ${completedLevel} Complete`, // 'message' NOT 'title'
        timestamp: serverTimestamp(),
      });

      saveLocal(uid, {
        ...(data as UserProfile),
        points:                newPoints,
        totalEarned:           newTotalEarned,
        boostLevel:            newBoostLevel,
        currentLevelAdCounter: 0,
        lastBoostDate:         today,
      });

      console.log(
        `[claimBoostReward] Level ${completedLevel} → +100 pts ` +
        `(${oldPoints} → ${newPoints}), next level: ${newBoostLevel}`
      );

      return { points: newPoints, boostLevel: newBoostLevel, completedLevel };
    });
  },

  // ── Offer Claiming ─────────────────────────────────────────────────────────

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

  // ── Profile CRUD ───────────────────────────────────────────────────────────

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
      tx.set(histRef, {
        uid,
        type:      'earn',
        points,
        message:   title,
        timestamp: serverTimestamp(),
      });
    });
    return true;
  },
};
