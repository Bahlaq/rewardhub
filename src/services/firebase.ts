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

// ─── Credentials (synced with google-services.json) ───────────────────────
//
//  google-services.json source of truth:
//    project_number : 563861371307
//    project_id     : rewardhub-1ea27
//    mobilesdk_app_id (Android): 1:563861371307:android:30156581fa40b33c247aee
//    oauth client_id (type 3 / web): 563861371307-cg3bnlt6j34r88odgtn5t5816o6dlchc.apps.googleusercontent.com
//
//  NOTE: google-services.json currently has NO client_type:1 (Android OAuth client).
//  This means no SHA-1 fingerprint has been registered yet.
//  Google Sign-In on Android will fail until you add the SHA-1 — see README below.
//
// ─── HOW TO FIX GOOGLE SIGN-IN ON ANDROID ────────────────────────────────
//  1. Run in your project root:
//       cd android && ./gradlew signingReport
//     Copy the SHA-1 from the "debug" or "release" variant.
//
//  2. Open Firebase Console → Project Settings → Your Apps → Android App
//     (com.rewardhub.official.app) → "Add fingerprint" → paste SHA-1 → Save.
//
//  3. Download the updated google-services.json and replace the one in
//     android/app/google-services.json. It will now contain a client_type:1 entry.
//
//  4. Re-run: npx cap sync android && npm run build:android
// ─────────────────────────────────────────────────────────────────────────

const WEB_CLIENT_ID =
  '563861371307-cg3bnlt6j34r88odgtn5t5816o6dlchc.apps.googleusercontent.com';

// Firebase config — appId matches mobilesdk_app_id in google-services.json
const firebaseConfig = {
  apiKey:            'AIzaSyBLlefWEa3WHUSPD0_sDTvpCTqIImh5X6Y', // Web API key (firebase-applet-config.json)
  authDomain:        'rewardhub-1ea27.firebaseapp.com',
  projectId:         'rewardhub-1ea27',
  storageBucket:     'rewardhub-1ea27.firebasestorage.app',
  messagingSenderId: '563861371307',
  appId:             '1:563861371307:android:30156581fa40b33c247aee', // ← from google-services.json mobilesdk_app_id
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
    console.log('[GoogleAuth] Initialized — serverClientId:', WEB_CLIENT_ID.slice(0, 24) + '…');
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
  console.log('[Firebase] Initialized — project:', firebaseConfig.projectId);
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

// ─── Firebase Service ───────────────────────────────────────────────────────
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
        // Provide actionable error for the most common native failure
        const msg: string = err?.message ?? String(err);
        if (
          msg.includes('10:') ||          // Google Sign-In error code 10 = SHA-1 missing
          msg.includes('DEVELOPER_ERROR') ||
          msg.includes('sign_in_failed')
        ) {
          throw new Error(
            'Google Sign-In Error 10 — DEVELOPER_ERROR.\n\n' +
            'Your SHA-1 fingerprint is not registered in Firebase.\n\n' +
            'Fix:\n' +
            '1. Run: cd android && ./gradlew signingReport\n' +
            '2. Copy the SHA-1 shown under "debug" or "release".\n' +
            '3. Firebase Console → Project Settings → Android App\n' +
            '   (com.rewardhub.official.app) → Add fingerprint → Save.\n' +
            '4. Download new google-services.json → replace android/app/google-services.json.\n' +
            '5. Run: npx cap sync android'
          );
        }
        throw err;
      }

      console.log('[GoogleAuth] signIn() resolved — email:', googleUser?.email);

      const idToken: string | undefined =
        googleUser?.authentication?.idToken ??
        (googleUser as any)?.idToken;

      if (!idToken) {
        throw new Error(
          'Google Sign-In did not return an ID Token.\n' +
          'This usually means the SHA-1 fingerprint is missing from Firebase.\n' +
          'See the fix instructions in firebase.ts comments.'
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
            // 'message' is the rules-required field; fall back to 'title' for legacy docs
            title:     data.message ?? data.title ?? 'Earned Points',
            // 'points' is the rules-required field; fall back to 'amount' for legacy docs
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

      // Points are intentionally NOT included — they are cumulative and permanent
      const resetFields = {
        boostLevel:            1,
        currentLevelAdCounter: 0,
        adsWatchedToday:       0,
        lastBoostDate:         today,
      };

      await setDoc(ref, resetFields, { merge: true });
      saveLocal(uid, { ...(data as UserProfile), ...resetFields });
      console.log('[DailyReset] Reset for', uid, '— points preserved:', data.points);
    } catch (err: any) {
      console.error('[DailyReset] Error:', err.code ?? err.message);
    }
  },

  // ── Progressive Boost ─────────────────────────────────────────────────────

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

      console.log(`[recordAdWatch] level=${boostLevel} counter=${currentLevelAdCounter}/${boostLevel}`);

      return { boostLevel, currentLevelAdCounter, adsNeeded: boostLevel, adsWatchedToday };
    });
  },

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
        throw new Error(`Boost not ready: watched ${currentLevelAdCounter}/${boostLevel} ads`);
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

      // CRITICAL: field names must satisfy firestore.rules isValidHistory():
      //   data.keys().hasAll(['uid', 'points', 'timestamp', 'type', 'message'])
      //   data.type in ['boost', 'claim', 'referral', 'earn']
      tx.set(histRef, {
        uid,
        type:      'earn',
        points:    100,                                             // ← 'points' NOT 'amount'
        message:   `Daily Boost Level ${completedLevel} Complete`, // ← 'message' NOT 'title'
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
        points,           // ← 'points'
        message:   title, // ← 'message'
        timestamp: serverTimestamp(),
      });
    });

    return true;
  },
};
