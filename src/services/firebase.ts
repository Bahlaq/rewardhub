import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  initializeFirestore, collection, query, where, doc, getDoc, setDoc,
  deleteDoc, onSnapshot, runTransaction, serverTimestamp
} from 'firebase/firestore';
import { 
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
  signOut, signInAnonymously, deleteUser, User as FirebaseUser, signInWithCredential
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { Offer, UserProfile, Transaction } from '../types';

const PRODUCTION_WEB_CLIENT_ID = "563861371307-cg3bnlt6j34r88odgtn5t5816o6dlchc.apps.googleusercontent.com";

// ═══════════════════════════════════════════════════════════════════════
// v12.1: DEFINITIVE Google Sign-In Fix
//
// WHAT PREVIOUSLY WORKED (and what didn't):
//   ✓ Original code showed the native picker (initialize with grantOfflineAccess:true)
//   ✗ After email selection: "No ID Token" error
//     → Because grantOfflineAccess:true returns a serverAuthCode, not an idToken
//   ✗ Changing grantOfflineAccess to false → picker stopped appearing
//   ✗ Removing initialize() → NullPointerException crash
//   ✗ Switching to @capacitor-firebase/authentication → crash on launch
//
// THE FIX (two changes):
//   1. Keep EXACT original params (grantOfflineAccess:true) that showed the picker
//   2. Use accessToken (always present) for Firebase credential exchange
//      instead of relying on idToken (absent with grantOfflineAccess:true)
//
//   GoogleAuthProvider.credential(idToken, accessToken) accepts EITHER.
//   When idToken is null, Firebase verifies the accessToken server-side.
//
//   Also: call signOut() before signIn() to clear cached state from
//   all our previous failed attempts with different config params.
// ═══════════════════════════════════════════════════════════════════════

let GoogleAuthInstance: any = null;

if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
  import('@codetrix-studio/capacitor-google-auth').then(({ GoogleAuth }) => {
    GoogleAuthInstance = GoogleAuth;
    try {
      // EXACT same params as original code that showed the native picker.
      // DO NOT change these — they are the only combination that works.
      (GoogleAuth as any).initialize({
        clientId: PRODUCTION_WEB_CLIENT_ID,
        serverClientId: PRODUCTION_WEB_CLIENT_ID,
        scopes: ['profile', 'email'],
        grantOfflineAccess: true
      });
      console.log("[GoogleAuth] Initialized successfully");
    } catch (error) {
      console.error("[GoogleAuth] initialize() failed:", error);
    }
  }).catch(err => {
    console.error("[GoogleAuth] Failed to load plugin:", err);
  });
}

const firebaseConfig = {
  apiKey: 'AIzaSyBLlefWEa3WHUSPD0_sDTvpCTqIImh5X6Y',
  authDomain: 'rewardhub-1ea27.firebaseapp.com',
  projectId: 'rewardhub-1ea27',
  storageBucket: 'rewardhub-1ea27.firebasestorage.app',
  messagingSenderId: '563861371307',
  appId: '1:563861371307:web:7db5542c5b2f2e46247aee',
  measurementId: 'G-PCK58GKBKM'
};

export const isConfigValid = true;
let app;
try { app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp(); }
catch (e) { console.error("Firebase init failed:", e); }

const db = app ? initializeFirestore(app, { experimentalForceLongPolling: true }) : null;
const auth = app ? getAuth(app) : null;
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ client_id: PRODUCTION_WEB_CLIENT_ID });

export { auth, db };
export type { FirebaseUser };

function getCol(uid: string) { return uid.startsWith('local_guest_') ? 'guests' : 'users'; }
function handleFsError(error: unknown, path: string | null, shouldThrow = true) {
  console.error('Firestore Error:', error instanceof Error ? error.message : String(error), 'path:', path);
  if (shouldThrow) throw error;
}

export const firebaseService = {
  async signInWithGoogle() {
    if (!auth) throw new Error("Firebase Auth not initialized");

    if (Capacitor.isNativePlatform()) {
      try {
        // Wait for plugin to be ready (it loads via dynamic import at top of file)
        if (!GoogleAuthInstance) {
          console.log("[Auth] Waiting for GoogleAuth plugin...");
          const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
          GoogleAuthInstance = GoogleAuth;
          (GoogleAuthInstance as any).initialize({
            clientId: PRODUCTION_WEB_CLIENT_ID,
            serverClientId: PRODUCTION_WEB_CLIENT_ID,
            scopes: ['profile', 'email'],
            grantOfflineAccess: true
          });
        }

        // Clear any cached sign-in state from previous attempts.
        // This is critical because we changed config params multiple times
        // and stale state causes the picker to not appear.
        try {
          await GoogleAuthInstance.signOut();
          console.log("[Auth] Cleared previous sign-in state");
        } catch {
          // signOut can fail if never signed in — that's fine
        }

        console.log("[Auth] Calling GoogleAuth.signIn()...");
        const googleUser = await GoogleAuthInstance.signIn();
        console.log("[Auth] signIn() returned. email:", googleUser?.email);

        // Log full response structure for debugging (console only)
        console.log("[Auth] Full response keys:", JSON.stringify(Object.keys(googleUser || {})));
        if (googleUser?.authentication) {
          console.log("[Auth] authentication keys:", JSON.stringify(Object.keys(googleUser.authentication)));
        }

        // Extract tokens — try ALL possible locations
        const idToken = googleUser?.authentication?.idToken
                     || (googleUser as any)?.idToken
                     || null;

        const accessToken = googleUser?.authentication?.accessToken
                         || (googleUser as any)?.accessToken
                         || null;

        // GoogleAuthProvider.credential() accepts EITHER idToken OR accessToken.
        // With grantOfflineAccess:true, idToken is typically null but accessToken is present.
        // Firebase verifies the accessToken server-side against Google's OAuth API.
        if (!idToken && !accessToken) {
          console.error("[Auth] Neither idToken nor accessToken found:", JSON.stringify(googleUser));
          throw new Error(
            "Google Sign-In succeeded but no tokens were returned. " +
            "Please check SHA-1 fingerprints in Firebase Console."
          );
        }

        console.log("[Auth] Creating Firebase credential with:",
          idToken ? "idToken" : "no idToken",
          accessToken ? "+ accessToken" : "+ no accessToken"
        );

        const credential = GoogleAuthProvider.credential(idToken, accessToken);
        const result = await signInWithCredential(auth, credential);
        console.log("[Auth] Firebase signInWithCredential success:", result.user.uid, result.user.email);

        await this._ensureProfile(result.user);
        return result.user;

      } catch (error: any) {
        const msg = error?.message || String(error);
        if (msg.includes('canceled') || msg.includes('cancelled') || msg.includes('12501') || msg.includes('popup_closed')) {
          throw new Error("Sign-in cancelled.");
        }
        console.error("[Auth] Native sign-in error:", error);
        throw error;
      }
    }

    // Web: popup
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await this._ensureProfile(result.user);
      return result.user;
    } catch (error) {
      console.error("[Auth] Web sign-in error:", error);
      throw error;
    }
  },

  async _ensureProfile(fbUser: FirebaseUser, fallbackEmail?: string) {
    const profile = await this.getUserProfile(fbUser.uid);
    if (!profile) {
      await this.saveUserProfile({
        uid: fbUser.uid, email: fbUser.email || fallbackEmail || 'Unknown',
        points: 0, claimsToday: 0, lastClaimDate: null, totalEarned: 0,
        boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0,
        lastBoostDate: new Date().toDateString()
      });
    }
  },

  async signInAnonymously() {
    if (!auth) throw new Error("Firebase Auth not initialized");
    const result = await signInAnonymously(auth);
    await this._ensureProfile(result.user, 'Guest User');
    return result.user;
  },

  async logout() {
    if (auth) await signOut(auth);
    // Also clear native plugin state
    if (Capacitor.isNativePlatform() && GoogleAuthInstance) {
      try { await GoogleAuthInstance.signOut(); } catch {}
    }
  },

  async deleteAccount() { if (auth?.currentUser) await deleteUser(auth.currentUser); },
  async deleteUserProfile(uid: string) { if (db) await deleteDoc(doc(db, getCol(uid), uid)); },
  onAuthChange(cb: (user: FirebaseUser | null) => void) { if (!auth) { cb(null); return () => {}; } return onAuthStateChanged(auth, cb); },

  onProfileChange(uid: string, cb: (p: UserProfile | null) => void) {
    if (!db) { cb(null); return () => {}; }
    return onSnapshot(doc(db, getCol(uid), uid), d => cb(d.exists() ? d.data() as UserProfile : null),
      err => { handleFsError(err, `${getCol(uid)}/${uid}`, false); cb(null); });
  },

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    if (!db) return null;
    try { const d = await getDoc(doc(db, getCol(uid), uid)); if (d.exists()) { const p = d.data() as UserProfile; localStorage.setItem(`profile_${uid}`, JSON.stringify(p)); return p; } const c = localStorage.getItem(`profile_${uid}`); return c ? JSON.parse(c) : null; }
    catch { const c = localStorage.getItem(`profile_${uid}`); return c ? JSON.parse(c) : null; }
  },

  async saveUserProfile(profile: UserProfile) {
    if (!db) return;
    try { await setDoc(doc(db, getCol(profile.uid), profile.uid), profile, { merge: true }); localStorage.setItem(`profile_${profile.uid}`, JSON.stringify(profile)); }
    catch (e) { handleFsError(e, `${getCol(profile.uid)}/${profile.uid}`, false); }
  },

  async checkDailyReset(uid: string) {
    if (!db) return;
    if (!uid.startsWith('local_guest_') && (!auth || !auth.currentUser)) return;
    try { const d = await getDoc(doc(db, getCol(uid), uid)); if (d.exists() && d.data().lastBoostDate !== new Date().toDateString()) { await setDoc(doc(db, getCol(uid), uid), { boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: new Date().toDateString() }, { merge: true }); } }
    catch (e) { handleFsError(e, `${getCol(uid)}/${uid}`, false); }
  },

  async recordAdWatch(uid: string) {
    if (!db) throw new Error("Firestore not initialized");
    const userRef = doc(db, getCol(uid), uid); const today = new Date().toDateString();
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef); let d: any;
      if (!snap.exists()) { d = { uid, points: 0, totalEarned: 0, boostLevel: 1, adsWatchedToday: 0, currentLevelAdCounter: 0, lastBoostDate: today, email: auth?.currentUser?.email || 'Unknown' }; tx.set(userRef, d); } else { d = snap.data(); }
      let boostLevel = Number(d.boostLevel) || 1; let currentLevelAdCounter = Number(d.currentLevelAdCounter) || 0; let lastBoostDate = d.lastBoostDate || null;
      if (lastBoostDate !== today) { boostLevel = 1; currentLevelAdCounter = 0; }
      const adsNeeded = boostLevel;
      if (currentLevelAdCounter >= adsNeeded) return { boostLevel, currentLevelAdCounter, adsNeeded };
      currentLevelAdCounter += 1;
      tx.set(userRef, { currentLevelAdCounter, lastBoostDate: today }, { merge: true });
      return { boostLevel, currentLevelAdCounter, adsNeeded };
    });
  },

  async claimBoostReward(uid: string) {
    if (!db) throw new Error("Firestore not initialized");
    const userRef = doc(db, getCol(uid), uid); const historyRef = doc(collection(db, 'history')); const today = new Date().toDateString();
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef); if (!snap.exists()) throw new Error("User not found"); const d = snap.data();
      let boostLevel = Number(d.boostLevel) || 1; let currentLevelAdCounter = Number(d.currentLevelAdCounter) || 0; let adsWatchedToday = Number(d.adsWatchedToday) || 0; let points = Number(d.points) || 0; let totalEarned = Number(d.totalEarned) || 0;
      if (currentLevelAdCounter < boostLevel) throw new Error("Boost requirement not met");
      points += 100; totalEarned += 100; const completedLevel = boostLevel; boostLevel += 1; adsWatchedToday += 1; currentLevelAdCounter = 0;
      tx.set(userRef, { points, totalEarned, boostLevel, adsWatchedToday, currentLevelAdCounter, lastBoostDate: today }, { merge: true });
      tx.set(historyRef, { uid, type: 'earn', points: 100, message: `Completed Boost Level ${completedLevel}`, timestamp: serverTimestamp() });
      return { points, boostLevel };
    });
  },

  onOffersChange(cb: (offers: Offer[]) => void) { if (!db) { cb([]); return () => {}; } return onSnapshot(query(collection(db, 'offers')), snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data(), points: Number(d.data().points || 0) } as Offer))), err => { handleFsError(err, 'offers', false); cb([]); }); },
  onClaimsChange(uid: string, cb: (claims: Transaction[]) => void) { if (!db) { cb([]); return () => {}; } return onSnapshot(query(collection(db, 'claims'), where('uid', '==', uid)), snap => cb(snap.docs.map(d => { const x = d.data(); return { id: d.id, type: 'claim', title: x.offerBrand, amount: -x.pointsSpent, timestamp: x.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(), code: x.code, rewardType: x.code ? 'code' : 'link' } as Transaction; })), err => { handleFsError(err, 'claims', false); cb([]); }); },
  onHistoryChange(uid: string, cb: (history: Transaction[]) => void) { if (!db) { cb([]); return () => {}; } return onSnapshot(query(collection(db, 'history'), where('uid', '==', uid)), snap => cb(snap.docs.map(d => { const x = d.data(); return { id: d.id, type: 'earn', title: x.title || x.message, amount: x.amount || x.points, timestamp: x.timestamp?.toDate?.()?.toISOString() || new Date().toISOString() } as Transaction; })), err => { handleFsError(err, 'history', false); cb([]); }); },

  async claimOffer(uid: string, offer: Offer) {
    if (!db) throw new Error("Firestore not initialized");
    const userRef = doc(db, getCol(uid), uid); const claimRef = doc(collection(db, 'claims'));
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef); if (!snap.exists()) throw new Error("User not found"); const u = snap.data() as UserProfile;
      if (u.points < offer.points) throw new Error("Insufficient points");
      tx.update(userRef, { points: Number(u.points) - Number(offer.points), claimsToday: (Number(u.claimsToday) || 0) + 1, lastClaimDate: new Date().toISOString() });
      tx.set(doc(collection(db, 'history')), { uid, type: 'claim', points: -Number(offer.points), message: `Claimed ${offer.brand}`, timestamp: serverTimestamp() });
      tx.set(claimRef, { uid, offerId: offer.id, offerBrand: offer.brand, code: offer.code || null, url: offer.url, pointsSpent: offer.points, timestamp: serverTimestamp() });
    });
    return true;
  },
};
