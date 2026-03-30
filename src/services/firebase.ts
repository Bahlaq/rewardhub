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
  apiKey: 'AIzaSyBLlefWEa3WHUSPD0_sDTvpCTqIImh5X6Y',
  authDomain: 'rewardhub-1ea27.firebaseapp.com',
  projectId: 'rewardhub-1ea27',
  storageBucket: 'rewardhub-1ea27.firebasestorage.app',
  messagingSenderId: '563861371307',
  appId: '1:563861371307:web:7db5542c5b2f2e46247aee',
};

// ─── Capacitor Google Auth lazy-load ───────────────────────────────────────
let GoogleAuthInstance: any = null;

function loadGoogleAuth(): Promise<any> {
  if (GoogleAuthInstance) return Promise.resolve(GoogleAuthInstance);
  return import('@codetrix-studio/capacitor-google-auth').then(({ GoogleAuth }) => {
    GoogleAuthInstance = GoogleAuth;
    try {
      (GoogleAuth as any).initialize({
        clientId: WEB_CLIENT_ID,
        serverClientId: WEB_CLIENT_ID,
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
      });
      console.log('[GoogleAuth] Initialized — clientId:', WEB_CLIENT_ID.slice(0, 20) + '...');
    } catch (err) {
      console.error('[GoogleAuth] initialize() failed:', err);
    }
    return GoogleAuth;
  });
}

// Pre-load on native
if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
  loadGoogleAuth().catch((err) =>
    console.error('[GoogleAuth] Pre-load failed:', err)
  );
}

// ─── Firebase Init ─────────────────────────────────────────────────────────
export const isConfigValid = true;

let _app: ReturnType<typeof initializeApp> | undefined;
try {
  _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (err) {
  console.error('[Firebase] Init error:', err);
}

// experimentalForceLongPolling ensures connectivity in strict environments
const db = _app
  ? initializeFirestore(_app, { experimentalForceLongPolling: true })
  : null;

const auth = _app ? getAuth(_app) : null;

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ client_id: WEB_CLIENT_ID });

export { auth, googleProvider, db };
export type { FirebaseUser };

// ─── Helpers ───────────────────────────────────────────────────────────────
function col(uid: string) {
  return uid.startsWith('local_guest_') ? 'guests' : 'users';
}

function saveLocal(uid: string, data: Partial<UserProfile>) {
  try {
    const prev = getLocal(uid) || ({} as UserProfile);
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

/** Safely create default profile fields without overwriting existing data */
function defaultProfile(uid: string, email: string): UserProfile {
  return {
    uid,
    email,
    points: 0,
    claimsToday: 0,
    lastClaimDate: null,
    totalEarned: 0,
    boostLevel: 1,
    adsWatchedToday: 0,
    currentLevelAdCounter: 0,
    lastBoostDate: new Date().toDateString(),
  };
}

// ─── Service ───────────────────────────────────────────────────────────────
export const firebaseService = {
  // ── Auth ─────────────────────────────────────────────────────────────────

  /**
   * Google Sign-In.
   * On native (Android/iOS): Capacitor Google Auth → Firebase credential.
   * On web: Firebase popup.
   */
  async signInWithGoogle(): Promise<FirebaseUser> {
    if (!auth) throw new Error('Firebase Auth not initialized');

    if (Capacitor.isNativePlatform()) {
      const GA = await loadGoogleAuth();

      console.log('[GoogleAuth] Calling signIn()…');
      const googleUser = await GA.signIn();
      console.log('[GoogleAuth] signIn() resolved — email:', googleUser?.email);

      // Extract idToken (field location varies by plugin version)
      const idToken: string | undefined =
        googleUser?.authentication?.idToken ??
        (googleUser as any)?.idToken;

      if (!idToken) {
        throw new Error(
          'No idToken received from Google. ' +
            'Check SHA-1 fingerprint in Firebase console (Project Settings → Your Apps → Android).'
        );
      }

      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      console.log('[Firebase] signInWithCredential OK — uid:', result.user.uid);

      await this._ensureProfile(result.user.uid, result.user.email ?? 'Google User');
      return result.user;
    }

    // Web
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
    if (!auth) {
      cb(null);
      return () => {};
    }
    return onAuthStateChanged(auth, cb);
  },

  // ── Internal helpers ──────────────────────────────────────────────────────

  async _ensureProfile(uid: string, email: string): Promise<void> {
    if (!db) return;
    const ref = doc(db, col(uid), uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const profile = defaultProfile(uid, email);
      await setDoc(ref, profile);
      saveLocal(uid, profile);
      console.log('[Profile] Created new profile for', uid);
    } else {
      saveLocal(uid, snap.data() as UserProfile);
    }
  },

  // ── Real-time listeners ───────────────────────────────────────────────────

  onProfileChange(
    uid: string,
    cb: (profile: UserProfile | null) => void
  ): () => void {
    if (!db) {
      cb(null);
      return () => {};
    }
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
        console.error('[Firestore] onProfileChange error:', err.code, err.message);
        cb(getLocal(uid));
      }
    );
  },

  onOffersChange(cb: (offers: Offer[]) => void): () => void {
    if (!db) {
      cb([]);
      return () => {};
    }
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
        console.error('[Firestore] onOffersChange error:', err.message);
        cb([]);
      }
    );
  },

  onClaimsChange(uid: string, cb: (claims: Transaction[]) => void): () => void {
    if (!db) {
      cb([]);
      return () => {};
    }
    return onSnapshot(
      query(collection(db, 'claims'), where('uid', '==', uid)),
      (snapshot) => {
        const claims = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            type: 'claim' as const,
            title: data.offerBrand ?? 'Claimed Offer',
            amount: Number(data.pointsSpent ?? 0), // positive — HistoryScreen subtracts
            timestamp:
              data.timestamp?.toDate?.()?.toISOString() ??
              new Date().toISOString(),
            code: data.code ?? undefined,
            rewardType: data.code ? 'code' : 'link',
          } as Transaction;
        });
        cb(claims);
      },
      (err) => {
        console.error('[Firestore] onClaimsChange error:', err.message);
        cb([]);
      }
    );
  },

  onHistoryChange(uid: string, cb: (history: Transaction[]) => void): () => void {
    if (!db) {
      cb([]);
      return () => {};
    }
    return onSnapshot(
      query(collection(db, 'history'), where('uid', '==', uid)),
      (snapshot) => {
        const history = snapshot.docs.map((d) => {
          const data = d.data();
          // history collection only stores earn events (boosts)
          return {
            id: d.id,
            type: 'earn' as const,
            title: data.title ?? data.message ?? 'Earned Points',
            amount: Math.abs(Number(data.amount ?? data.points ?? 0)),
            timestamp:
              data.timestamp?.toDate?.()?.toISOString() ??
              new Date().toISOString(),
          } as Transaction;
        });
        cb(history);
      },
      (err) => {
        console.error('[Firestore] onHistoryChange error:', err.message);
        cb([]);
      }
    );
  },

  // ── Daily Reset (CRITICAL: never touch `points`) ──────────────────────────

  /**
   * Compares lastBoostDate to today.
   * If they differ → reset boostLevel=1, currentLevelAdCounter=0, adsWatchedToday=0.
   * Points are NEVER touched here.
   */
  async checkDailyReset(uid: string): Promise<void> {
    if (!db) return;

    // Skip unauthenticated non-guest calls to avoid permission errors on startup
    const isGuest = uid.startsWith('local_guest_');
    if (!isGuest && (!auth || !auth.currentUser)) {
      console.log('[DailyReset] Skipped — not yet authenticated');
      return;
    }

    const ref = doc(db, col(uid), uid);
    const today = new Date().toDateString();

    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) return;

      const data = snap.data();
      if (data.lastBoostDate === today) return; // Nothing to reset

      // Boost counters reset — POINTS intentionally excluded
      const resetFields = {
        boostLevel: 1,
        currentLevelAdCounter: 0,
        adsWatchedToday: 0,
        lastBoostDate: today,
      };

      await setDoc(ref, resetFields, { merge: true });
      saveLocal(uid, { ...(data as UserProfile), ...resetFields });
      console.log('[DailyReset] Reset for', uid, '— points preserved at', data.points);
    } catch (err: any) {
      console.error('[DailyReset] Error:', err.code ?? err.message);
    }
  },

  // ── Progressive Boost ─────────────────────────────────────────────────────

  /**
   * Records one ad watch. Increments currentLevelAdCounter.
   * Returns updated state so the caller can react immediately.
   *
   * Math: boostLevel N requires N ads.
   */
  async recordAdWatch(uid: string): Promise<{
    boostLevel: number;
    currentLevelAdCounter: number;
    adsNeeded: number;
    adsWatchedToday: number;
  }> {
    if (!db) throw new Error('Firestore not initialized');

    const ref = doc(db, col(uid), uid);
    const today = new Date().toDateString();

    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);

      let data: any;
      if (!snap.exists()) {
        // First-time user — initialise with merge
        data = defaultProfile(uid, auth?.currentUser?.email ?? 'Guest User');
        tx.set(ref, data);
      } else {
        data = snap.data();
      }

      // ── Daily reset (inside transaction for atomicity) ──
      let boostLevel = Number(data.boostLevel) || 1;
      let currentLevelAdCounter = Number(data.currentLevelAdCounter) || 0;
      let adsWatchedToday = Number(data.adsWatchedToday) || 0;

      if (data.lastBoostDate !== today) {
        // New day — reset boost counters, keep points intact
        boostLevel = 1;
        currentLevelAdCounter = 0;
        adsWatchedToday = 0;
      }

      // ── Increment this-round counter ──
      currentLevelAdCounter += 1;

      tx.set(
        ref,
        { currentLevelAdCounter, lastBoostDate: today },
        { merge: true }
      );

      // Update cache
      saveLocal(uid, { ...data, currentLevelAdCounter, lastBoostDate: today });

      console.log(
        `[recordAdWatch] uid=${uid} level=${boostLevel} counter=${currentLevelAdCounter}/${boostLevel}`
      );

      return {
        boostLevel,
        currentLevelAdCounter,
        adsNeeded: boostLevel,
        adsWatchedToday,
      };
    });
  },

  /**
   * Claims the boost reward after watching boostLevel ads.
   *  - points      += 100
   *  - boostLevel  += 1   (next level needs one more ad)
   *  - currentLevelAdCounter = 0  (fresh round)
   *  - Writes to history collection: { title, amount: 100, type: 'earn' }
   */
  async claimBoostReward(uid: string): Promise<{
    points: number;
    boostLevel: number;
    completedLevel: number;
  }> {
    if (!db) throw new Error('Firestore not initialized');

    const ref = doc(db, col(uid), uid);
    const histRef = doc(collection(db, 'history'));
    const today = new Date().toDateString();

    return runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('User profile not found');

      const data = snap.data();
      const boostLevel = Number(data.boostLevel) || 1;
      const currentLevelAdCounter = Number(data.currentLevelAdCounter) || 0;

      if (currentLevelAdCounter < boostLevel) {
        throw new Error(
          `Boost not ready: watched ${currentLevelAdCounter}/${boostLevel} ads`
        );
      }

      const oldPoints = Number(data.points) || 0;
      const newPoints = oldPoints + 100;
      const newTotalEarned = (Number(data.totalEarned) || 0) + 100;
      const newBoostLevel = boostLevel + 1;
      const completedLevel = boostLevel;

      // Update user document
      tx.set(
        ref,
        {
          points: newPoints,
          totalEarned: newTotalEarned,
          boostLevel: newBoostLevel,
          currentLevelAdCounter: 0,
          adsWatchedToday: (Number(data.adsWatchedToday) || 0) + 1,
          lastBoostDate: today,
        },
        { merge: true }
      );

      // Write earn event to history
      tx.set(histRef, {
        uid,
        type: 'earn',
        title: `Daily Boost Level ${completedLevel} Complete`,
        amount: 100,
        timestamp: serverTimestamp(),
      });

      // Update local cache
      saveLocal(uid, {
        ...(data as UserProfile),
        points: newPoints,
        totalEarned: newTotalEarned,
        boostLevel: newBoostLevel,
        currentLevelAdCounter: 0,
        lastBoostDate: today,
      });

      console.log(
        `[claimBoostReward] Level ${completedLevel} claimed — points: ${oldPoints} → ${newPoints}, next level: ${newBoostLevel}`
      );

      return { points: newPoints, boostLevel: newBoostLevel, completedLevel };
    });
  },

  // ── Offer Claiming ────────────────────────────────────────────────────────

  async claimOffer(uid: string, offer: Offer): Promise<boolean> {
    if (!db) throw new Error('Firestore not initialized');

    const ref = doc(db, col(uid), uid);
    const claimRef = doc(collection(db, 'claims'));

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('User profile not found');

      const data = snap.data() as UserProfile;
      if (data.points < offer.points) throw new Error('Insufficient points');

      tx.update(ref, {
        points: Number(data.points) - Number(offer.points),
        claimsToday: (Number(data.claimsToday) || 0) + 1,
        lastClaimDate: new Date().toISOString(),
      });

      tx.set(claimRef, {
        uid,
        offerId: offer.id,
        offerBrand: offer.brand,
        code: offer.code ?? null,
        url: offer.url,
        pointsSpent: offer.points,
        timestamp: serverTimestamp(),
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
      console.error('[Profile] getUserProfile error:', err.code ?? err.message);
      return getLocal(uid);
    }
  },

  async saveUserProfile(profile: UserProfile): Promise<void> {
    saveLocal(profile.uid, profile);
    if (!db) return;
    try {
      await setDoc(doc(db, col(profile.uid), profile.uid), profile, {
        merge: true,
      });
    } catch (err: any) {
      console.error('[Profile] saveUserProfile error:', err.code ?? err.message);
    }
  },

  // Legacy helper kept for compatibility
  async rewardUserPoints(uid: string, points: number, title: string): Promise<boolean> {
    if (!db) throw new Error('Firestore not initialized');

    const ref = doc(db, col(uid), uid);
    const histRef = doc(collection(db, 'history'));

    await setDoc(ref, { uid, points: 0, totalEarned: 0 }, { merge: true });

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('User profile not found');
      const data = snap.data() as UserProfile;
      tx.update(ref, {
        points: (data.points || 0) + points,
        totalEarned: (data.totalEarned || 0) + points,
      });
      tx.set(histRef, { uid, type: 'earn', title, amount: points, timestamp: serverTimestamp() });
    });

    return true;
  },
};
